import { Service } from 'egg';
import { existsSync } from 'fs';
import { join } from 'path';
import { FileStatus } from '../types';

export default class LogExistChecker extends Service {

  public async check(metaData: any) {
    const fileList = this.ctx.service.fileUtils.getFilePathList();
    const fileConfig = this.config.fileProcessor;
    for (const p of fileList) {
      if (!existsSync(join(fileConfig.baseDir, p))) {
        metaData[p] = FileStatus.NeedDownload;
      } else if (!metaData[p]) {
        metaData[p] = FileStatus.Downloaded;
      }
    }
    this.ctx.service.fileUtils.writeMetaData(metaData);
  }

}
