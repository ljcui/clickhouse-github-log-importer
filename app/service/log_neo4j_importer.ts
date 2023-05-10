/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { createInterface } from 'readline';
import { waitUntil } from '../utils';
import { stdin as input, stdout as output } from 'process';

interface EntityItem {
  createdAt: Date;
  data?: {
    [key: string]: any;
  };
}
type NodeType = 'github_repo' | 'github_org' | 'github_actor' | 'github_issue' | 'github_change_request' | 'issue_label' | 'language' | 'license';
const nodeTypes: NodeType[] = [
  'github_repo', 'github_org', 'github_actor', 'github_issue', 'github_change_request',
  'issue_label', 'language', 'license',
];
const nodePrimaryKey = new Map<NodeType, string>([
  ['issue_label', 'name'],
  ['language', 'name'],
  ['license', 'spdx_id'],
]);

interface EdgeItem {
  from: any;
  to: any;
  createdAt: Date;
  id?: number;
  data?: {
    [key: string]: any;
  };
}
type EdgeType = 'has_license' | 'has_language' | 'has_repo' | 'has_issue_change_request' | 'has_issue_label' | 'open' | 'comment' | 'close' | 'has_assignee' | 'has_requested_reviewer' | 'review' | 'review_comment';
const edgeTypes: EdgeType[] = ['has_license', 'has_language', 'has_repo', 'has_issue_change_request', 'has_issue_label', 'open', 'comment', 'close', 'has_assignee', 'has_requested_reviewer', 'review', 'review_comment'];
const edgeTypePair = new Map<EdgeType, string[]>([
  ['has_license', ['github_repo', 'license']],
  ['has_language', ['github_repo', 'language']],
  ['has_repo', ['github_org', 'github_repo']],
  ['has_issue_change_request', ['github_repo', 'github_issue|github_change_request']],
  ['has_issue_label', ['github_issue|github_change_request', 'issue_label']],
  ['open', ['github_actor', 'github_issue|github_change_request']],
  ['comment', ['github_actor', 'github_issue|github_change_request']],
  ['close', ['github_actor', 'github_issue|github_change_request']],
  ['has_assignee', ['github_issue|github_change_request', 'github_actor']],
  ['has_requested_reviewer', ['github_change_request', 'github_actor']],
  ['review', ['github_actor', 'github_change_request']],
  ['review_comment', ['github_actor', 'github_change_request']],
]);

export default class LogTugraphImporter extends Service {

  private nodeMap: Map<NodeType, Map<number, EntityItem>>;
  private edgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private exportNodeMap: Map<NodeType, Map<number, EntityItem>>;
  private exportEdgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private isExporting = false;

  public async import(filePath: string, onSuccess: () => void): Promise<void> {
    this.init();
    await this.service.fileUtils.readlineUnzip(filePath, async line => {
      try {
        this.parse(line);
      } catch (e) {
        this.logger.error(`Error on parse line, e=${JSON.stringify(e)}, line=${line}`);
      }
    });
    // wait until last insert done
    await waitUntil(() => !this.isExporting, 10);
    this.isExporting = true;
    // change node map and edge map reference to avoid next data procedure clear the data on inserting
    this.exportNodeMap = this.nodeMap;
    this.exportEdgeMap = this.edgeMap;
    (async () => {
      this.logger.info(`Start to insert ${filePath}.`);
      try {
        await this.insertNodes();
      } catch (e) {
        this.logger.error(`Error on insert nodes, e=${e}`);
      }
      await this.insertEdges();
      this.logger.info(`Insert ${filePath} done.`);
      this.isExporting = false;
      onSuccess();
    })();
  }

  private init() {
    this.nodeMap = new Map<NodeType, Map<number, EntityItem>>();
    this.edgeMap = new Map<EdgeType, Map<string, Map<number, EdgeItem>>>();
    nodeTypes.forEach(t => this.nodeMap.set(t, new Map<number, EntityItem>()));
    edgeTypes.forEach(t => this.edgeMap.set(t, new Map<string, Map<number, EdgeItem>>()));
  }

  private updateNode(type: NodeType, id: any, data: any, createdAt: Date) {
    const dataMap = this.nodeMap.get(type)!;
    if (dataMap.has(id)) {
      const item = dataMap.get(id)!;
      if (item.createdAt.getTime() <= createdAt.getTime()) {
        item.data = {
          ...item.data,
          ...data,
        };
        item.createdAt = createdAt;
      }
    } else {
      dataMap.set(id, { data, createdAt });
    }
  }

  private updateEdge(type: EdgeType, from: any, to: any, id: number, data: any, createdAt: Date) {
    const key = `${from}_${to}`;
    const dataMap = this.edgeMap.get(type)!;
    if (!dataMap.has(key)) {
      dataMap.set(key, new Map<number, EdgeItem>());
    }
    const item = dataMap.get(key)!.get(id) ?? { from, to, id, data, createdAt };
    if (item.createdAt.getTime() < createdAt.getTime()) {
      item.data = data;
      item.createdAt = createdAt;
    }
    dataMap.get(key)!.set(id, item);
  }

  private parse(line: string) {
    const r = JSON.parse(line);
    const type = r.type;
    const action = r.payload?.action;

    const eventId = parseInt(r.id);
    const actorId = parseInt(r.actor.id);
    const actorLogin = r.actor.login;
    const repoId = parseInt(r.repo.id);
    const repoName = r.repo.name;
    const createdAt = new Date(r.created_at);
    if (!this.check(actorId, actorLogin, repoId, repoName, createdAt)) {
      this.logger.info(`Invalid line: ${line}`);
      return;
    }
    this.updateNode('github_repo', repoId, { id: repoId, name: repoName }, createdAt);
    this.updateNode('github_actor', actorId, { id: actorId, login: actorLogin }, createdAt);
    if (r.org) {
      const orgId = parseInt(r.org.id);
      const orgLogin = r.org.login;
      if (this.check(orgId, orgLogin)) {
        this.updateNode('github_org', orgId, { id: orgId, login: orgLogin }, createdAt);
        this.updateEdge('has_repo', orgId, repoId, -1, {}, createdAt);
      }
    }

    const created_at = this.formatDateTime(createdAt);
    const getTuGraphIssueId = (): string => {
      const issue = r.payload.issue ?? r.payload.pull_request;
      const number = parseInt(issue.number);
      return `${repoId}_${number}`;
    };

    const parseIssue = () => {
      let issue = r.payload.issue;
      let isPull = false;
      if (!issue) {
        issue = r.payload.pull_request;
        isPull = true;
      }
      if (!this.check(issue)) {
        this.logger.info(`Issue not found ${r.payload}`);
        return;
      }
      const number = parseInt(issue.number);
      const title = issue.title;
      const body = issue.body ?? '';
      this.updateNode(isPull ? 'github_change_request' : 'github_issue', getTuGraphIssueId(), {
        id: getTuGraphIssueId(),
        number,
        title,
        body,
      }, createdAt);
      if (!Array.isArray(issue.labels)) issue.labels = [];
      issue.labels.forEach(l => {
        const label = l.name;
        this.updateNode('issue_label', label, {}, createdAt);
        this.updateEdge('has_issue_label', getTuGraphIssueId(), label, -1, {}, createdAt);
      });
      if (issue.assignee) {
        const assigneeId = parseInt(issue.assignee.id);
        const assigneeLogin = issue.assignee.login;
        this.updateNode('github_actor', assigneeId, { id: assigneeId, login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', getTuGraphIssueId(), assigneeId, -1, {}, createdAt);
      }
      if (!Array.isArray(issue.assignees)) issue.assignees = [];
      issue.assignees.forEach(a => {
        const assigneeId = parseInt(a.id);
        const assigneeLogin = a.login;
        this.updateNode('github_actor', assigneeId, { id: assigneeId, login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', getTuGraphIssueId(), assigneeId, -1, {}, createdAt);
      });
      this.updateEdge('has_issue_change_request', repoId, getTuGraphIssueId(), -1, {}, createdAt);

      if (action === 'opened') {
        this.updateEdge('open', actorId, getTuGraphIssueId(), eventId, { id: eventId, created_at }, createdAt);
      } else if (action === 'closed') {
        this.updateEdge('close', actorId, getTuGraphIssueId(), eventId, { id: eventId, created_at }, createdAt);
      }
      return issue;
    };

    const parseIssueComment = () => {
      const id = r.payload.comment.id;
      const body = r.payload.comment.body;
      this.updateEdge('comment', actorId, getTuGraphIssueId(), id, { id, body, created_at }, createdAt);
    };

    const parsePullRequest = () => {
      const pull = parseIssue();
      const commits = parseInt(pull.commits ?? 0);
      const additions = parseInt(pull.additions ?? 0);
      const deletions = parseInt(pull.deletions ?? 0);
      const changed_files = parseInt(pull.changed_files ?? 0);
      if (action === 'closed') {
        if (pull.merged) {
          this.updateEdge('close', actorId, getTuGraphIssueId(), eventId, {
            id: eventId,
            merged: true,
            created_at,
          }, createdAt);
        } else {
          this.updateEdge('close', actorId, getTuGraphIssueId(), eventId, {
            id: eventId,
            merged: false,
            created_at,
          }, createdAt);
        }
      }
      if ([commits, additions, deletions, changed_files].some(i => i > 0)) {
        // these may not exists for some events
        this.updateNode('github_change_request', getTuGraphIssueId(), {
          id: getTuGraphIssueId(),
          commits,
          additions,
          deletions,
          changed_files,
        }, createdAt);
      }
      if (!Array.isArray(pull.requested_reviewers)) pull.requested_reviewers = [];
      pull.requested_reviewers.forEach(r => {
        const reviewerId = parseInt(r.id);
        const reviewerLogin = r.login;
        this.updateNode('github_actor', reviewerId, { login: reviewerLogin }, createdAt);
        this.updateEdge('has_requested_reviewer', getTuGraphIssueId(), reviewerId, -1, {}, createdAt);
      });
      const repo = pull.base.repo;
      if (repo.language) {
        const language = repo.language;
        this.updateNode('language', language, {}, createdAt);
        this.updateEdge('has_language', repoId, language, -1, {}, createdAt);
      }
      if (repo.license) {
        const spdx_id = repo.license.spdx_id;
        if (this.check(spdx_id)) {
          this.updateNode('license', spdx_id, {}, createdAt);
          this.updateEdge('has_license', repoId, spdx_id, -1, {}, createdAt);
        }
      }
      ['description', 'default_branch'].forEach(f => {
        if (r[f]) this.updateNode('github_repo', repoId, { [f]: repo[f] }, createdAt);
      });
      ['updated_at', 'created_at', 'pushed_at'].forEach(f => {
        if (r[f]) this.updateNode('github_repo', repoId, { [f]: this.formatDateTime(new Date(repo[f])) }, createdAt);
      });
      if (this.check(pull.base?.ref, pull.base?.sha)) {
        this.updateNode('github_change_request', getTuGraphIssueId(), {
          base_ref: pull.base.ref,
        }, createdAt);
      }
      if (this.check(pull.head?.ref, pull.head?.sha, pull.head?.repo)) {
        this.updateNode('github_change_request', getTuGraphIssueId(), {
          head_id: pull.head.repo.id,
          head_name: pull.head.repo.full_name,
          head_ref: pull.head.ref,
        }, createdAt);
      }
      return pull;
    };

    const parsePullRequestReview = () => {
      parsePullRequest();
      const review = r.payload.review;
      const body = review.body ?? '';
      const state = review.state ?? '';
      const id = review.id ?? 0;
      this.updateEdge('review', actorId, getTuGraphIssueId(), id, {
        id,
        body,
        state,
        created_at,
      }, createdAt);
    };

    const parsePullRequestReviewComment = () => {
      parsePullRequest();
      const comment = r.payload.comment;
      const id = comment.id;
      const body = comment.body;
      const path = comment.path;
      const position = comment.position ?? 0;
      const line = comment.line ?? 0;
      const startLine = comment.start_line ?? 0;
      this.updateEdge('review_comment', actorId, getTuGraphIssueId(), id, {
        id,
        body,
        path,
        position,
        line,
        start_line: startLine,
        created_at,
      }, createdAt);
    };

    const parseMap = new Map<string, Function>([
      ['IssuesEvent', parseIssue],
      ['IssueCommentEvent', parseIssueComment],
      ['PullRequestEvent', parsePullRequest],
      ['PullRequestReviewEvent', parsePullRequestReview],
      ['PullRequestReviewCommentEvent', parsePullRequestReviewComment],
    ]);
    if (parseMap.has(type)) {
      parseMap.get(type)!();
    }
  }

  private objToString(obj: any): string {
    const type = typeof obj;
    if (type === 'object') { // if nested object
      if (Array.isArray(obj)) { // array obj, wrap with []
        return `[${obj.map(o => this.objToString(o)).join(',')}]`;
      }
      // normal object, recursive call
      return `{${Object.entries(obj).map(([k, v]) => `${k}:${this.objToString(v)}`).join(',')}}`;
    } else if (type === 'string') { // if string, wrap by '
      return `'${obj}'`;
    }
    return obj.toString(); // simple type
  }

  private async insertNodes() {
    const processArr: any[] = [];
    for (const type of nodeTypes) {
      const map = this.exportNodeMap.get(type)!;
      const primary = nodePrimaryKey.get(type) ?? 'id';
      const nodes = Array.from(map.entries()).map(i => {
        const n: any = {
          [primary]: i[0],
          properties: {
            ...i[1].data,
          },
        };
        if (['github_actor', 'github_repo', 'github_org', 'github_issue', 'github_change_request'].includes(type)) {
          n.properties.__updated_at = this.formatDateTime(i[1].createdAt);
        }
        return n;
      });
      if (nodes.length === 0) continue;
      processArr.push(this.service.neo4j.runQueryWithParamBatch(`
UNWIND $nodes AS node
MERGE (n:${type}{${primary}:node.${primary}})
SET n += node.properties
`, nodes, 'nodes'));
    }
    await Promise.all(processArr);
  }

  private async insertEdges() {
    for (const type of edgeTypes) {
      const edges: any[] = [];
      let hasId = false;
      let hasCreatedAt = false;
      const map = this.exportEdgeMap.get(type)!;
      const [fromLabel, toLabel]: any[] = edgeTypePair.get(type)!;
      const fromLabels = fromLabel.split('|');
      const toLabels = toLabel.split('|');
      const [fromKey, toKey] = [fromLabel, toLabel].map(t => nodePrimaryKey.get(t) ?? 'id');
      for (const m of map.values()) {
        for (const v of m.values()) {
          if (!v.from || !v.to) continue; // avoid id parse error
          edges.push({
            from: v.from,
            to: v.to,
            data: v.data ?? {},
            id: v.id ?? -1,
          });
          if (v.id && v.id > 0) hasId = true;
          if (v.data?.created_at) hasCreatedAt = true;
        }
      }
      if (edges.length === 0) continue;
      try {
        await this.service.neo4j.runQueryWithParamBatch(`
UNWIND $edges AS edge
MATCH (from${fromLabels.length > 1 ? '' : `:${fromLabel}`}{${fromKey}:edge.from})
${fromLabels.length > 1 ? `WHERE ${fromLabels.map(l => `from:${l}`).join(' OR ')}` : ''}
WITH edge, from
MATCH (to${toLabels.length > 1 ? '' : `:${toLabel}`}{${toKey}:edge.to})
${toLabels.length > 1 ? `WHERE ${toLabels.map(l => `to:${l}`).join(' OR ')}` : ''}
WITH edge, from, to
MERGE (from)-[e:${type}${hasId ? '{id:edge.id}' : ''}]->(to)
SET e += edge.data${hasCreatedAt ? ', e.created_at=datetime(edge.data.created_at)' : ''}
`, edges, 'edges');
      } catch (e) {
        this.logger.error(`Error on insert edges ${type}, e=${e}`);
      }
    }
  }

  private check(...params: any[]): boolean {
    return params.every(p => p !== null && p !== undefined);
  }

  private formatDateTime(d: Date): string {
    return d.toISOString();
  }

  public async initDatabase(forceInit: boolean) {
    if (!forceInit) return;
    return new Promise<void>(resolve => {
      const rl = createInterface({ input, output });
      rl.question('!!!Do you want to init the neo4j database?(Yes)', async answer => {
        if (answer !== 'Yes') return resolve();
        // clear database and reset indexes
        const initQuries = ['MATCH (n) DETACH DELETE n;'];
        nodeTypes.forEach(type => {
          initQuries.push(`CREATE CONSTRAINT ${type}_unique IF NOT EXISTS FOR (r:${type}) REQUIRE r.${nodePrimaryKey.get(type) ?? 'id'} IS UNIQUE;`);
        });
        initQuries.push('CREATE INDEX github_actor_login IF NOT EXISTS FOR (r:github_actor) ON (r.login);');
        initQuries.push('CREATE INDEX github_org_login IF NOT EXISTS FOR (r:github_org) ON (r.login);');
        initQuries.push('CREATE INDEX github_repo_name IF NOT EXISTS FOR (r:github_repo) ON (r.name);');
        ['open', 'comment', 'review', 'review_comment', 'close'].forEach(t => {
          initQuries.push(`CREATE INDEX ${t}_created_at IF NOT EXISTS FOR (r:${t}) ON (r.created_at);`);
        });
        for (const q of initQuries) {
          await this.service.neo4j.runQuery(q);
        }
        this.logger.info('Init database done.');
        resolve();
      });
    });
  }

}
