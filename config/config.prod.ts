import { EggAppConfig, PowerPartial } from 'egg';

export default () => {
  const config: PowerPartial<EggAppConfig> = {};

  config.fileProcessor = {
    baseDir: '/root/GHA_DATA',
  };


  config.clickhouse = {
    serverConfig: {
      host: process.env.CLICKHOUSE_SERVER || 'clickhouse',
    },
  };

  return config;
};
