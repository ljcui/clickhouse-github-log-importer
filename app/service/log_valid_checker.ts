import { Service } from 'egg';
import { FileStatus } from '../types';
import { join } from 'path';
import { unlinkSync, existsSync, createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { once } = require('events');

export default class LogValidChecker extends Service {

  public async check(meta: any) {
    // check `Downloaded` file if all valid
    const fileConfig = this.config.fileProcessor;
    for (const k in meta) {
      if (meta[k] !== FileStatus.Downloaded) {
        continue;
      }
      const filePath = join(fileConfig.baseDir, k);
      const checkRes = await this.checkFile(filePath);
      if (checkRes === false) {
        // delete not valid file for further download
        unlinkSync(filePath);
        meta[k] = FileStatus.NeedDownload;
      } else {
        meta[k] = FileStatus.Verified;
      }
      this.ctx.service.fileUtils.writeMetaData(meta);
    }
  }

  private async checkFile(filePath: string): Promise<boolean> {
    return new Promise(async resolve => {
      // check if all file valid
      try {
        if (!existsSync(filePath)) {
          return resolve(false);
        }
        const unzip = createGunzip();
        // pipe causes async so try-catch won't catch this error
        // need to handler the error in `on` function
        const fileStream = createReadStream(filePath).pipe(unzip).on('error', e => {
          this.logger.info(`File ${filePath} unzip exception.`, e);
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
        this.logger.info(`File ${filePath} parse exception.`, e);
        resolve(false);
      }
    });
  }

}
