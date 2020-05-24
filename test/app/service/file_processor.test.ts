import mock, { MockApplication } from 'egg-mock';
import assert = require('power-assert');

describe('/app/service/file_processor.ts', () => {
  let app: MockApplication;

  before(async () => {
    app = mock.app();
    return app.ready();
  });

  it('should return right file path list', async () => {
    const fileList = app.mockContext().service.fileUtils.getFilePathList();
    const config = app.config.fileProcessor;
    const endTime = config.getEndTime();
    const time = endTime.getTime() - config.startTime.getTime();
    // need to add one day and consider the time zone offset(in hours)
    const hours = time / (60 * 60 * 1000) + 24 - endTime.getTimezoneOffset() / 60;
    assert(fileList.length === hours);
  });
});
