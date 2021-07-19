import { Service } from 'egg';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { FileStatus } from '../types';
import dateformat = require('dateformat');
import { sep } from 'path';

export default class UpdateStatus extends Service {

  public async update() {
    const statusFilePath = this.app.config.statusFilePath;
    if (!existsSync(statusFilePath)) {
      return;
    }

    const status = JSON.parse(readFileSync(statusFilePath).toString());

    const metaData = this.ctx.service.fileUtils.getMetaData();

    const stat = this.ctx.service.fileUtils.metaDataStat(metaData);
    const downloadedCount = stat.get(FileStatus.Downloaded) ?? 0;
    const needDownloadCount = stat.get(FileStatus.NeedDownload) ?? 0;
    const importedCount = stat.get(FileStatus.Imported) ?? 0;
    const verifiedCount = stat.get(FileStatus.Verified) ?? 0;
    const total = needDownloadCount + downloadedCount + importedCount + verifiedCount;
    const missingArr: string[] = [];
    for (const k of Object.keys(metaData)) {
      if (metaData[k] === FileStatus.NeedDownload) {
        missingArr.push(k.substr(k.lastIndexOf(sep) + 1));
      }
    }

    status.total = total;
    status.imported = importedCount;
    status.importFail = total - importedCount - needDownloadCount;
    status.missing = needDownloadCount;
    status.missingRate = (total - importedCount) / (total);
    status.missingArr = missingArr.sort();
    status.updateTime = dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss');

    writeFileSync(statusFilePath, JSON.stringify(status));
  }

}
