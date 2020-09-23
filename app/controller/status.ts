/* eslint-disable array-bracket-spacing */
import { Controller } from 'egg';
import { FileStatus } from '../types';

export default class Status extends Controller {

  public async get() {
    const ctx = this.ctx;
    const metaData = ctx.service.fileUtils.getMetaData();
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
