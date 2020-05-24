import { Service } from 'egg';
import { FileStatus } from '../types';

export default class LogDownloader extends Service {

  public async download(meta: any) {
    // download the lost files
    for (const k in meta) {
      const s = meta[k];
      if (s === FileStatus.NeedDownload) {
        // need download the file
      }
    }
  }

}
