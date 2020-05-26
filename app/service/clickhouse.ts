import { Service } from 'egg';
import ClickHouse = require('@apla/clickhouse');

export default class Clickhouse extends Service {

  private _client: any;

  public get client(): any {
    if (this._client) {
      return this._client;
    }
    const config = this.config.clickhouse;
    const clickhouse = new ClickHouse(config.serverConfig);
    this._client = clickhouse;
    return clickhouse;
  }

  public async query<T>(q: string): Promise<T | undefined> {
    return this.client.querying(q);
  }

}
