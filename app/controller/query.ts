/* eslint-disable array-bracket-spacing */
import { Controller } from 'egg';
import { ClickhouseSelectResponse } from '../types';
import { FieldMap } from '../utils';

export default class Query extends Controller {

  public async repoActivity() {
    const startTime = new Date();
    const db = 'github_log';
    const table = this.ctx.queries.table ?? 'year2015';
    let topN = 20;
    try {
      topN = parseInt(this.ctx.queries.topN[0]);
    } catch {
      //
    }
    if (topN > 100) topN = 100;
    else if (topN < 0) topN = 20;
    const weight = {
      issueCommentWeight: 1,
      openIssueWeight: 2,
      openPullWeight: 3,
      pullReviewWeight: 4,
      mergePullWeight: 5,
    };
    const query = `SELECT contribute_list.repo_id AS repo_id, round(sum(sqrt(contribute_list.score)),2) AS repo_activity 
FROM
(SELECT
icc.repo_id AS repo_id, icc.actor_id AS actor_id, ${weight.issueCommentWeight}*icc.count+${weight.openIssueWeight}*oic.count+${weight.openPullWeight}*opc.count+${weight.pullReviewWeight}*rcc.count+${weight.mergePullWeight}*mpc.count AS score
FROM
(SELECT repo_id, actor_id, COUNT(*) count FROM ${db}.${table} WHERE type='IssueCommentEvent' AND action='created' GROUP BY repo_id, actor_id) AS icc
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM ${db}.${table} WHERE type='IssuesEvent' AND action='opened' GROUP BY repo_id, actor_id) AS oic
ON icc.repo_id=oic.repo_id AND icc.actor_id=oic.actor_id 
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM ${db}.${table} WHERE type='PullRequestEvent' AND action='opened' GROUP BY repo_id, actor_id) AS opc
ON icc.repo_id=opc.repo_id AND icc.actor_id=opc.actor_id 
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM ${db}.${table} WHERE type='PullRequestReviewCommentEvent' AND action='created' GROUP BY repo_id, actor_id) AS rcc
ON icc.repo_id=rcc.repo_id AND icc.actor_id=rcc.actor_id
LEFT JOIN
(SELECT repo_id, issue_author_id AS actor_id, COUNT(*) as count FROM ${db}.${table} WHERE type='PullRequestEvent' AND action='closed' AND pull_merged=1 GROUP BY repo_id, actor_id) AS mpc
ON icc.repo_id=mpc.repo_id AND icc.actor_id=mpc.actor_id) AS contribute_list
GROUP BY repo_id
ORDER BY repo_activity DESC
LIMIT ${topN}`;
    const idRankList: ClickhouseSelectResponse<{ repo_id: number; repo_activity: number }[]> = await this.service.clickhouse.client.querying(query);
    if (!idRankList.data) {
      this.ctx.body = 'Internal error.';
      this.ctx.status = 500;
      return;
    }
    const ret: { name: string; activity: number }[] = [];

    await Promise.all(idRankList.data.map(async item => {
      const r = await this.service.clickhouse.client.querying(`SELECT repo_name AS name FROM ${db}.${table} WHERE repo_id=${item.repo_id} LIMIT 1`);
      ret.push({
        name: r.data[0].name,
        activity: item.repo_activity,
      });
    }));

    ret.sort((a, b) => { return b.activity > a.activity ? 1 : -1; });
    this.ctx.body = {
      data: ret,
      elapsed: new Date().getTime() - startTime.getTime(),
      mainQuery: query,
    };
    this.ctx.status = 200;
  }

  public async recordCount() {
    const startTime = new Date();
    const db = 'github_log';
    const table = this.ctx.queries.table ?? 'year2015';

    const query = `SELECT COUNT(*) AS count FROM ${db}.${table}`;

    const result: ClickhouseSelectResponse<{ count: number }[]> = await this.service.clickhouse.client.querying(query);

    this.ctx.body = {
      data: result.data[0],
      elapsed: new Date().getTime() - startTime.getTime(),
      mainQuery: query,
    };
    this.ctx.status = 200;
  }

  public async mostUsedLabel() {
    const startTime = new Date();
    const db = 'github_log';
    const table = this.ctx.queries.table ?? 'year2015';
    let topN = 20;
    try {
      topN = parseInt(this.ctx.queries.topN[0]);
    } catch {
      //
    }
    if (topN > 100) topN = 100;
    else if (topN < 0) topN = 20;

    const query = `SELECT label, COUNT(*) as count
FROM (SELECT JSONExtractString(arrayJoin(JSONExtractArrayRaw(issue_labels)), 'name') as label FROM ${db}.${table} WHERE (type = 'IssuesEvent' OR type = 'PullRequestEvent') AND action = 'closed')
GROUP BY label
ORDER BY count DESC
LIMIT ${topN}`;

    const result: ClickhouseSelectResponse<{ count: number }[]> = await this.service.clickhouse.client.querying(query);

    this.ctx.body = {
      data: result.data,
      elapsed: new Date().getTime() - startTime.getTime(),
      mainQuery: query,
    };
    this.ctx.status = 200;
  }

  public async index() {
    const startTime = new Date();
    if (!this.ctx.request.body.query) {
      this.ctx.body = 'Query needed';
      this.ctx.status = 400;
      return;
    }
    this.logger.info(`Start a query: ${this.ctx.request.body.query}`);
    const result: ClickhouseSelectResponse<any> = await this.service.clickhouse.client.querying(this.ctx.request.body.query);
    this.ctx.body = {
      data: result.data,
      elapsed: new Date().getTime() - startTime.getTime(),
    };
    this.ctx.status = 200;
  }

  public async dbSchema() {
    const ret: { key: string; type: string }[] = [];
    for (const [key, type] of FieldMap) {
      ret.push({ key, type });
    }
    this.ctx.body = ret;
    this.ctx.status = 200;
  }

}
