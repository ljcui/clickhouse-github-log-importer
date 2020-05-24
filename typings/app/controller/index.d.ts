// This file is created by egg-ts-helper@1.25.8
// Do not modify this file!!!!!!!!!

import 'egg';
import ExportQuery from '../../../app/controller/query';

declare module 'egg' {
  interface IController {
    query: ExportQuery;
  }
}
