/* eslint-disable array-bracket-spacing */
import { Controller } from 'egg';
import { FileStatus } from '../types';

export default class Status extends Controller {

  public async get() {
    const ctx = this.ctx;
    const metaData = ctx.service.fileUtils.getMetaData();
    const before = ctx.query.before;
    if (before) {
      const beforeDate = new Date(before);
      const beforeYear = beforeDate.getFullYear();
      const beforeMonth = beforeDate.getMonth() + 1;
      const beforeDay = beforeDate.getDate();
      const beforeHour = beforeDate.getHours();
      for (const k of Object.keys(metaData)) {
        const [year, month, day, hour] = k.substring(k.lastIndexOf('/') + 1, k.indexOf('.')).split('-').map(s => parseInt(s));
        let needDelete = false;
        if ((year > beforeYear) ||
          (year === beforeYear && month > beforeMonth) ||
          (year === beforeYear && month === beforeMonth && day > beforeDay) ||
          (year === beforeYear && month === beforeMonth && day === beforeDay && hour > beforeHour)) {
          needDelete = true;
        }
        if (needDelete) {
          delete metaData[k];
        }
      }
    }
    this.logger.info(Object.keys(metaData)[1]);
    const stat = ctx.service.fileUtils.metaDataStat(metaData);
    const downloadedCount = stat.get(FileStatus.Downloaded) ?? 0;
    const needDownloadCount = stat.get(FileStatus.NeedDownload) ?? 0;
    const importedCount = stat.get(FileStatus.Imported) ?? 0;
    const verifiedCount = stat.get(FileStatus.Verified) ?? 0;
    const total = needDownloadCount + downloadedCount + importedCount + verifiedCount;
    this.ctx.body = {
      total,
      imported: importedCount,
      importFail: total - importedCount - needDownloadCount,
      missing: needDownloadCount,
      missingRate: (total - importedCount) / (total),
    };
  }

}
