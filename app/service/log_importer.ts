/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { EOL } from 'os';
import { join } from 'path';
import { StaticPool } from 'node-worker-threads-pool';
import { FileStatus } from '../types';
import { FieldMap } from '../utils';

export default class LogImporter extends Service {

  public async import(meta: any) {
    const config = this.config.fileProcessor;
    const dbConfig = this.config.clickhouse;
    await this.init(meta, config.forceInit);
    if (config.forceInit) {
      for (const k in meta) {
        if (meta[k] === FileStatus.Imported) {
          meta[k] = FileStatus.Verified;
        }
      }
      this.ctx.service.fileUtils.writeMetaData(meta);
    }

    const pool = new StaticPool({
      size: config.workerNum,
      task: join(__dirname, '../importer_worker.js'),
      resourceLimits: {
        maxOldGenerationSizeMb: config.workerMaxMemoryMb,
      },
    });
    const params: { filePath: string; key: string }[] = [];
    for (const f in meta) {
      if (meta[f] === FileStatus.Verified) {
        const filePath = join(config.baseDir, f);
        params.push({ filePath, key: f });
      }
    }

    let importedCount = 0;
    await Promise.all(params.map(async p => {
      const matchResult = p.filePath.match(/.*\/(\d+)-(\d+)-(\d+)-(\d+).json.gz/);
      if (!matchResult) {
        return;
      }
      const insertResult = await pool.exec({
        filePath: p.filePath,
        dbConfig: {
          serverConfig: dbConfig.serverConfig,
          db: dbConfig.getDb(p.key),
          table: dbConfig.getTable(p.key),
        },
      });
      if (insertResult) {
        meta[p.key] = FileStatus.Imported;
        importedCount++;
        this.ctx.service.fileUtils.writeMetaData(meta);
        if (importedCount % 1000 === 0) {
          this.logger.info(`${importedCount} files have been imported.`);
        }
      }
    }));
  }

  private async init(meta: any, forceInit: boolean) {
    this.logger.info('Start to init database');
    const dbConfig = this.config.clickhouse;
    const getTableSchema = (map: Map<string, string>): string => {
      let ret = '';
      // eslint-disable-next-line array-bracket-spacing
      for (const [key, value] of map) {
        ret += `\`${key}\` ${value},${EOL}`;
      }
      return ret.substring(0, ret.length - 2) + EOL;
    };
    const initQuerys: string[] = [];
    Array.from(new Set<string>(Object.keys(meta).map(k => dbConfig.getDb(k)))).forEach(d => {
      initQuerys.push(`CREATE DATABASE IF NOT EXISTS ${d}`);
    });
    Array.from(new Map<string, string>(Object.keys(meta).map(k => [dbConfig.getTable(k), dbConfig.getDb(k)]))).forEach(p => {
      if (forceInit) {
        initQuerys.push(`DROP TABLE IF EXISTS ${p[1]}.${p[0]}`);
      }
      initQuerys.push(`CREATE TABLE IF NOT EXISTS ${p[1]}.${p[0]}
(
${getTableSchema(FieldMap)}
) ENGINE = MergeTree(created_date, (actor_id, repo_id, type), 8192)`);
    });
    for (const q of initQuerys) {
      await this.ctx.service.clickhouse.query(q);
    }
    this.logger.info('Database inited.');
  }

}
