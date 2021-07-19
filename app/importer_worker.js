/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, createReadStream } = require('fs');
const ParseFuncMap = require('./parser');
const { createGunzip } = require('zlib');
const { createInterface } = require('readline');
const ClickHouse = require('@apla/clickhouse');

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

async function insertRecords(filePath, ids, dbConfig) {
  return new Promise(async resolve => {
    try {
      if (!existsSync(filePath)) {
        resolve(true);
        return;
      }

      // open file stream
      const unzip = createGunzip();
      const fileStream = createReadStream(filePath).pipe(unzip).on('error', resolve);

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      // open database stream
      const client = new ClickHouse(dbConfig.serverConfig);
      const stream = client.query(`INSERT INTO ${dbConfig.db}.${dbConfig.table}`, { format: 'JSONEachRow' }, e => {
        if (e) {
          console.error(filePath, e.message);
          return resolve(false);
        }
        resolve(true);
      });
      stream.on('error', e => {
        console.error(filePath, e.message);
        resolve(false);
      });

      // write file content into database
      for await (const line of rl) {
        try {
          const item = JSON.parse(line);
          const row = ParseFuncMap.get(item.type)?.call(undefined, item);
          if (!ids.has(row.id)) {
            stream.write(row);
          }
        } catch {
          console.log(`Error on parse record, line=${line}`);
        }
      }

      stream.end();

    } catch (e) {
      console.error(e);
      resolve(false);
    }
  });
}

parentPort?.on('message', async param => {
  const ids = await readExistIds(param.filePath, param.dbConfig);
  const result = await insertRecords(param.filePath, ids, param.dbConfig);
  parentPort?.postMessage(result);
});
