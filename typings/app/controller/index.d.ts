// This file is created by egg-ts-helper@1.29.1
// Do not modify this file!!!!!!!!!

import 'egg';
import ExportQuery from '../../../app/controller/query';
import ExportStatus from '../../../app/controller/status';

declare module 'egg' {
  interface IController {
    query: ExportQuery;
    status: ExportStatus;
  }
}
