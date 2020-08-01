/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, createReadStream } = require('fs');
const { createGunzip } = require('zlib');
const { createInterface } = require('readline');
const { once } = require('events');

async function checkFile(filePath) {
  return new Promise(async resolve => {
    // check if a file valid
    try {
      if (!existsSync(filePath)) {
        return resolve(false);
      }
      const unzip = createGunzip();
      // pipe causes async so try-catch won't catch this error
      // need to handler the error in `on` function
      const fileStream = createReadStream(filePath).pipe(unzip).on('error', e => {
        console.log(`File ${filePath} unzip exception.`, e);
        resolve(false);
      });

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      rl.on('line', line => {
        if (line.trim().length >= 0) {
          JSON.parse(line);
        }
      });

      await once(rl, 'close');
      fileStream.end();
      rl.close();

      resolve(true);
    } catch (e) {
      console.log(`File ${filePath} parse exception.`, e);
      resolve(false);
    }
  });
}

parentPort?.on('message', async param => {
  const result = await checkFile(param.filePath);
  parentPort?.postMessage(result);
});
