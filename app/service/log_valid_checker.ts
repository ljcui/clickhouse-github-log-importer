import { Service } from 'egg';
import { FileStatus } from '../types';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { StaticPool } from 'node-worker-threads-pool';

export default class LogValidChecker extends Service {

  public async check(meta: any) {
    // check `Downloaded` file if all valid
    const config = this.config.fileProcessor;
    const params: { filePath: string; key: string }[] = [];
    for (const k in meta) {
      if (meta[k] !== FileStatus.Downloaded) {
        continue;
      }
      const filePath = join(config.baseDir, k);
      params.push({ filePath, key: k });
    }

    const pool = new StaticPool({
      size: config.checkerNum,
      task: join(__dirname, '../checker_worker.js'),
      resourceLimits: {
        maxOldGenerationSizeMb: config.checkerMaxMemoryMb,
      },
    });
    await Promise.all(params.map(async p => {
      const checkRes = await pool.exec({ filePath: p.filePath });
      if (checkRes === false) {
        // delete not valid file for further download
        if (existsSync(p.filePath)) {
          unlinkSync(p.filePath);
        }
        meta[p.key] = FileStatus.NeedDownload;
      } else {
        meta[p.key] = FileStatus.Verified;
      }
      this.ctx.service.fileUtils.writeMetaData(meta);
    }));
  }

}
