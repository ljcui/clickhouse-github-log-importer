/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, createReadStream } = require('fs');
const ParseFuncMap = require('./parser');
const { createGunzip } = require('zlib');
const { createInterface } = require('readline');
const ClickHouse = require('@apla/clickhouse');

async function insertRecords(filePath, dbConfig) {
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
          if (row) {
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
  const result = await insertRecords(param.filePath, param.dbConfig);
  parentPort?.postMessage(result);
});
