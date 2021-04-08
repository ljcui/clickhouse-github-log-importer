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
        try {
          const item = JSON.parse(line);
          ret.push(ParseFuncMap.get(item.type)?.call(undefined, item));
        } catch {
          console.log(`Error on parse record, line=${line}`);
        }
      }

      resolve(ret);
    } catch (e) {
      console.error(e);
      resolve([]);
    }
  });
}

async function readExistIds(f, dbConfig) {
  return new Promise(async resolve => {
    const ids = new Set();
    const matchResult = f.match(/.*\/(\d+)-(\d+)-(\d+)-(\d+).json.gz/);
    if (!matchResult) {
      resolve(ids);
      return;
    }
    // careful about month which starts as 0 in js
    const timestamp = Date.UTC(matchResult[1], parseInt(matchResult[2]) - 1, matchResult[3], matchResult[4]);
    const start = (timestamp - 30 * 60 * 1000) / 1000;
    const end = (timestamp + 90 * 60 * 1000) / 1000;
    const client = new ClickHouse(dbConfig.serverConfig);
    const stream = client.query(`SELECT id FROM ${dbConfig.db}.${dbConfig.table} WHERE created_at>toDateTime(${start}) AND created_at<toDateTime(${end})`);
    stream.on('data', row => {
      ids.add(row.id);
    });
    stream.on('end', () => {
      resolve(ids);
    });
  });
}

async function insertRecords(f, r, ids, dbConfig) {
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
      if (row && !ids.has(row.id)) {
        ids.add(row.id);
        stream.write(row);
      }
    }
    stream.end();
  });
}

parentPort?.on('message', async param => {
  const [
    records, ids,
  ] = await Promise.all([
    readRecords(param.filePath),
    readExistIds(param.filePath, param.dbConfig),
  ]);
  const result = await insertRecords(param.filePath, records, ids, param.dbConfig);
  parentPort?.postMessage(result);
});
