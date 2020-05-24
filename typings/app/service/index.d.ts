// This file is created by egg-ts-helper@1.25.8
// Do not modify this file!!!!!!!!!

import 'egg';
type AnyClass = new (...args: any[]) => any;
type AnyFunc<T = any> = (...args: any[]) => T;
type CanExportFunc = AnyFunc<Promise<any>> | AnyFunc<IterableIterator<any>>;
type AutoInstanceType<T, U = T extends CanExportFunc ? T : T extends AnyFunc ? ReturnType<T> : T> = U extends AnyClass ? InstanceType<U> : U;
import ExportClickhouse from '../../../app/service/clickhouse';
import ExportFileUtils from '../../../app/service/file_utils';
import ExportLogDownloader from '../../../app/service/log_downloader';
import ExportLogExistChecker from '../../../app/service/log_exist_checker';
import ExportLogImporter from '../../../app/service/log_importer';
import ExportLogValidChecker from '../../../app/service/log_valid_checker';

declare module 'egg' {
  interface IService {
    clickhouse: AutoInstanceType<typeof ExportClickhouse>;
    fileUtils: AutoInstanceType<typeof ExportFileUtils>;
    logDownloader: AutoInstanceType<typeof ExportLogDownloader>;
    logExistChecker: AutoInstanceType<typeof ExportLogExistChecker>;
    logImporter: AutoInstanceType<typeof ExportLogImporter>;
    logValidChecker: AutoInstanceType<typeof ExportLogValidChecker>;
  }
}
