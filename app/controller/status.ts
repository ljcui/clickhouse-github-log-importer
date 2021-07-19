/* eslint-disable array-bracket-spacing */
import { Controller } from 'egg';
import { readFileSync } from 'fs';

export default class Status extends Controller {

  public async get() {
    const ctx = this.ctx;
    const fileContent = JSON.parse(readFileSync(ctx.app.config.statusFilePath).toString());
    this.ctx.body = fileContent;
  }

}
