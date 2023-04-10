import { Service } from 'egg';
import request = require('requestretry');

export default class Tugraph extends Service {
  private token: string;

  private async login(): Promise<void> {
    return new Promise(async resolve => {
      const config = this.config.tugraph;
      request({
        url: `${config.url}/login`,
        method: 'POST',
        headers: {
          Accept: 'application/json; charset=UTF-8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: config.user,
          password: config.pass,
        }),
        maxAttempts: 5,
        retryDelay: 1000,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      }, (err, _response, body) => {
        if (err) {
          this.logger.error(err);
        }
        try {
          if (body) {
            const result = JSON.parse(body);
            this.token = result.jwt;
          }
        } catch (e) {
          this.logger.error(`Error while parse login token: ${e}`);
        } finally {
          resolve();
        }
      });
    });
  }

  public async cypher(q: string, params?: any): Promise<any> {
    return new Promise(async resolve => {
      if (!this.token) {
        await this.login();
      }
      if (!this.token) {
        return resolve({ err: 'Login failed' });
      }
      this.logger.info(q);
      const config = this.config.tugraph;
      const url = `${config.url}/cypher`;
      request({
        url,
        method: 'POST',
        headers: {
          Accept: 'application/json; charset=UTF-8',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          graph: config.graph,
          script: q,
          parameters: params,
        }),
        maxAttempts: 5,
        retryDelay: 1000,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      }, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return resolve({ err });
        }
        if (body) {
          resolve(JSON.parse(body));
        } else {
          this.logger.info(`No body found, the response is: ${JSON.stringify(response)}`);
          resolve({ err: 'No body' });
        }
      });
    });
  }

  public async callPlugin(type: 'cpp' | 'python', name: string, params: any): Promise<any> {
    return new Promise(async resolve => {
      if (!this.token) {
        await this.login();
      }
      if (!this.token) {
        return resolve({ err: 'Login failed' });
      }
      const config = this.config.tugraph;
      request({
        url: `${config.url}/db/${config.graph}/${type}_plugin/${name}`,
        method: 'POST',
        headers: {
          Accept: 'application/json; charset=UTF-8',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          data: JSON.stringify(params),
          timeout: 0,
        }),
        maxAttempts: 5,
        retryDelay: 1000,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      }, (err, _response, body) => {
        if (err) {
          this.logger.error(err);
        }
        try {
          if (body) {
            const result = JSON.parse(body);
            this.token = result.jwt;
          }
        } catch (e) {
          this.logger.error(`Error while parse login token: ${e}`);
        } finally {
          resolve(body);
        }
      });
    });
  }

  public async listPlugin(type: 'cpp' | 'python'): Promise<any> {
    return new Promise(async resolve => {
      if (!this.token) {
        await this.login();
      }
      if (!this.token) {
        return resolve({ err: 'Login failed' });
      }
      const config = this.config.tugraph;
      request({
        url: `${config.url}/db/${config.graph}/${type}_plugin`,
        method: 'GET',
        headers: {
          Accept: 'application/json; charset=UTF-8',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        maxAttempts: 5,
        retryDelay: 1000,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError,
      }, (err, _response, body) => {
        if (err) {
          this.logger.error(err);
        }
        try {
          if (body) {
            const result = JSON.parse(body);
            this.token = result.jwt;
          }
        } catch (e) {
          this.logger.error(`Error while parse login token: ${e}`);
        } finally {
          resolve(body);
        }
      });
    });
  }
}
