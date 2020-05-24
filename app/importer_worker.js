/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, createReadStream } = require('fs');
const ParseFuncMap = require('./parser');
const { createGunzip } = require('zlib');
const { createInterface } = require('readline');
const ClickHouse = require('@apla/clickhouse');

async function readRecords(filePath) {
  return new Promise(async resolve => {
    const ret = [];
    try {
      if (!existsSync(filePath)) {
        return ret;
      }
      const unzip = createGunzip();
      const fileStream = createReadStream(filePath).pipe(unzip).on('error', resolve);

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const item = JSON.parse(line);
        ret.push(ParseFuncMap.get(item.type)?.call(undefined, item));
      }

      resolve(ret);
    } catch (e) {
      console.error(e);
      resolve([]);
    }
  });
}

async function insertRecords(f, r, dbConfig) {
  return new Promise(resolve => {
    if (r.length <= 0) {
      return resolve(true);
    }
    const client = new ClickHouse(dbConfig.serverConfig);
    const stream = client.query(`INSERT INTO ${dbConfig.db}.${dbConfig.table}`, { format: 'JSONEachRow' }, e => {
      if (e) {
        console.error(f, e.message);
        return resolve(false);
      }
      resolve(true);
    });
    stream.on('error', e => {
      console.error(f, e.message);
      resolve(false);
    });
    for (const row of r) {
      if (row) {
        stream.write(row);
      }
    }
    stream.end();
  });
}

parentPort?.on('message', async param => {
  const records = await readRecords(param.filePath);
  const result = await insertRecords(param.filePath, records, param.dbConfig);
  parentPort?.postMessage(result);
});
