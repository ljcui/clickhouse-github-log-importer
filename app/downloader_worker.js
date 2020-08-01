/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, unlinkSync } = require('fs');
const { exec } = require('child_process');
const { resolve } = require('path');
const mkdirp = require('mkdirp');

const fileDownload = (url, output) => {
  return new Promise(r => {
    const dir = resolve(output, '../');
    if (!existsSync(dir)) {
      mkdirp.sync(dir);
    }
    if (existsSync(output)) {
      unlinkSync(output);
    }
    // use Linux wget to retrive file into certain dir
    const command = `wget -P ${dir} ${url}`;
    exec(command, err => {
      if (err) {
        // if error happens, file can't be intact, clean up
        console.log(`Error ${err}`);
        if (existsSync(output)) {
          unlinkSync(output);
        }
        return r(false);
      }
      return r(true);
    });
  });
};

parentPort?.on('message', async param => {
  const result = await fileDownload(param.url, param.filePath);
  parentPort?.postMessage(result);
});
