import { Service } from 'egg';
import { ClickHouseClient, createClient } from '@clickhouse/client';

export default class Clickhouse extends Service {

  private _client: ClickHouseClient;

  public get client(): ClickHouseClient {
    if (this._client) {
      return this._client;
    }
    const config = this.config.clickhouse;
    const clickhouse = createClient(config.serverConfig);
    this._client = clickhouse;
    return clickhouse;
  }

  public async query<T>(q: string): Promise<T | undefined> {
    return this.client.exec({ query: q });
  }

}
