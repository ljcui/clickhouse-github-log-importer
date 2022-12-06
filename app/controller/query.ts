/* eslint-disable array-bracket-spacing */
import { Controller } from 'egg';
import { FieldMap } from '../utils';

export default class Query extends Controller {

  public async dbSchema() {
    const ret: { key: string; type: string }[] = [];
    for (const [key, type] of FieldMap) {
      ret.push({ key, type });
    }
    this.ctx.body = ret;
    this.ctx.status = 200;
  }

}
