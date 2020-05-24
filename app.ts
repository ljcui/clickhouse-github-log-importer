import { Application } from 'egg';

export default class AppBootHook {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public async didReady() {
    this.app.createAnonymousContext().service.fileUtils.unlock();
    process.on('uncaughtException', e => this.app.logger.error(e));
  }
}
