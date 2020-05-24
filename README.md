# GitHub 日志导入程序 for Clickhouse

该项目用于持续导入 GitHub 事件日志文件，并通过 HTTP 接口提供 ClickHouse 的访问能力。

## 配置

目前的项目配置主要分为两部分，即 ClickHouse 数据库配置和文件处理配置。所有配置的默认配置均在 [`config/config.default.ts`](config/config.default.ts) 文件中，如需修改，请在本地的 [`config/config.prod.ts`](config/config.prod.ts) 中修改相应配置项即可。

### ClickHouse 数据库配置

`ClickHouse` 数据库配置在 [`config.clickhouse`](config/config.default.ts#L42) 中，如下所示：

``` typescript
config.clickhouse = {
  serverConfig: {
    host: 'localhost',
    protocol: 'http:',
    port: 8123,
    format: 'JSON',
  },
  getDb: (fileName: string): string => {
    return 'github_log';
  },
  getTable: (fileName: string): string => {
    return `year${fileName.substring(0, 4)}`;
  },
};
```

其中 `serverConfig` 为直接传递给 `ClickHouse` 客户端 Driver 的配置，可根据自己的需求进行添加和修改，该项目使用的 `ClickHouse` 客户端为 [`node-clickhouse`](https://github.com/apla/node-clickhouse)。

`getDb` 函数返回数据库的库名，传入参数为每个处理文件的文件名，可根据文件名返回不同的数据库名。默认为同一个库，即 `github_log`。

`getTable` 函数返回的是表名，传入参数为每个处理文件的文件名，可根据文件名返回不同的表名。默认是根据文件所在年份返回如 `year2015` 等不同表名。

### 文件处理配置

文件处理配置在 [`config.fileProcessor`](config/config.default.ts#L28) 中，如下所示：

```typescript
config.fileProcessor = {
  baseDir: '/Users/frankzhao/Documents/GHA_DATA',
  workerNum: 6,
  metaFilePath: 'meta.json',
  lockFilePath: '.lock',
  startTime: new Date('2015-01-01'),
  getEndTime: () => {
    const date = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
    date.setHours(0, 0, 0, 0);
    return date;
  },
  needInit: false,
};
```

- `baseDir` 为原始日志文件存储目录，请使用绝对路径配置。
- `workerNum` 为并行处理文件的线程数量，可根据本机硬件情况设置，注意不要设置过大，可能导致 CPU 打满卡死机器。默认为 6。
- `metaFilePath` 为元信息存储路径，以 `baseDir` 为根目录，不存在可以自动生成。默认为 `meta.json`。
- `lockFilePath` 为锁文件路径，以 `baseDir` 为根目录，用于在本次处理过程中锁住当前文件夹，避免其他启动的脚本访问该目录，该文件会在处理完成后删除。默认为 `.lock`。
- `startTime` 为处理文件的开始时间，默认为 `2015-01-01`。
- `getEndTime` 为获取处理文件的结束时间的函数。默认为返回相较当前时间早一天的日期，即当天处理截止到前一天的所有数据。
- `needInit` 为是否需要初始化的选项，默认为 `false`，如改为 `true`，会删除所有已有数据库并重新导入，慎用。

## 流程

文件处理流程与文件相应状态相关联，该项目中将文件状态分为 `NeedDownload`，`Downloaded`，`Verified`，`Imported` 四种，状态信息存储在 `metaFilePath` 中，处理流程为如下四步：

- 检查文件是否存在：该步骤对应文件为 [`log_exist_checker.ts`](app/service/log_exist_checker.ts)，处理流程为检查元信息中的文件是否存在，若不存在则置相应文件状态为 `NeedDownloaded`，即需要下载。若存在且元信息中不包含该文件状态，则置其状态为 `Downloaded`，即已下载完成。
- 下载文件：该步骤对应文件为 [`log_downloader.ts`](app/service/log_downloader.ts)，处理流程为检查元信息中的所有为 `NeedDownlaod` 状态的文件，并下载文件到对应路径中，置其状态位 `Downloaded`。
- 检查文件：该步骤对应文件为 [`log_valid_checker.ts`](app/log_valid_checker.ts)，处理流程为解压并尝试解析所有状态为 `Downloaded` 文件，若解压和解析全部正确，则置其状态为 `Verified`。否则表示该文件包含错误，删除该文件，并置其状态为 `NeedDownloaded`。
- 导入文件：该步骤对应文件为 [`log_importer.ts`](app/service/log_importer.ts)，处理流程为对于所有状态为 `Verified` 的文件，将其在内存中解压并导入数据库。此时会创建一个线程数量为 `workerNum` 的线程池，每次调用导入一个文件的所有记录。线程池处理流程对应文件为 [`importer_worker.js`](app/importer_worker.js)，日志记录项解析逻辑在文件 [`parser.js`](app/parser.js) 中。

应用启动后，会通过 [`update_log.ts`](app/schedule/update_log.ts) 进行离线任务调度，默认每天 15 时开始任务，分别进行上述几步，直到导入完成。首次导入可能需要较长时间（6 线程下大约 7500W 条记录每小时）。

## 查询接口

该项目同时提供了 HTTP 访问接口用于进行 `Clickhouse` 数据库查询。

### 默认接口
默认接口为 `/query`，通过向该路径 `POST` query 可以进行数据查询。请求时请将 `Content-Type` 设置为 `application/x-www-form-urlencoded` 并将查询语句置入 `query` 中即可。

### Schema 接口
通过 `GET` `/query/db_schema` 接口，可以获取当前数据库的表接口，返回格式为 `Array<{key:string;type:string}>`，即列名、类型数组。

### 示例接口

本项目同时提供了数个示例接口，用于学习如何使用 `Clickhouse` 进行数据查询，每个接口返回结果的同时，会返回该查询使用的时间（ms）和对应的示例查询语句。

#### 查询某年日志记录数量

`GET` `/query/record_count?table=year2017`。其中 `table` 为表名，默认为 `year2015`。

Query 语句为

``` SQL
SELECT COUNT(*) AS count FROM github_log.year2015
```

#### 查询某年最多使用的 Label

`GET` `/query/most_used_label?table=year2017&topN=10`。其中 `table` 为表名，默认为 `year2015`，`topN` 为返回的最常用多少个 `label`，默认为 20。

``` SQL
SELECT label, COUNT(*) as count
FROM
(SELECT JSONExtractString(arrayJoin(JSONExtractArrayRaw(issue_labels)), 'name') as label FROM github_log.year2015 WHERE (type = 'IssuesEvent' OR type = 'PullRequestEvent') AND action = 'closed')
GROUP BY label
ORDER BY count DESC
LIMIT 20
```

#### 以 GitHub 2019 数字年报公式查询年度最活跃项目

`GET` `/query/repo_activity?table=year2017&topN=10`。其中 table 为表名，默认为 `year2015`。`topN` 为返回的活跃度最高的多少个项目，默认为 20。

``` SQL
SELECT contribute_list.repo_id AS repo_id, round(sum(sqrt(contribute_list.score)),2) AS repo_activity 
FROM
(SELECT
icc.repo_id AS repo_id, icc.actor_id AS actor_id, icc.count+2*oic.count+3*opc.count+4*rcc.count+5*mpc.count AS score
FROM
(SELECT repo_id, actor_id, COUNT(*) count FROM github_log.year2015 WHERE type='IssueCommentEvent' AND action='created' GROUP BY repo_id, actor_id) AS icc
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM github_log.year2015 WHERE type='IssuesEvent' AND action='opened' GROUP BY repo_id, actor_id) AS oic
ON icc.repo_id=oic.repo_id AND icc.actor_id=oic.actor_id 
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM github_log.year2015 WHERE type='PullRequestEvent' AND action='opened' GROUP BY repo_id, actor_id) AS opc
ON icc.repo_id=opc.repo_id AND icc.actor_id=opc.actor_id 
LEFT JOIN
(SELECT repo_id, actor_id, COUNT(*) count FROM github_log.year2015 WHERE type='PullRequestReviewCommentEvent' AND action='created' GROUP BY repo_id, actor_id) AS rcc
ON icc.repo_id=rcc.repo_id AND icc.actor_id=rcc.actor_id
LEFT JOIN
(SELECT repo_id, issue_author_id AS actor_id, COUNT(*) as count FROM github_log.year2015 WHERE type='PullRequestEvent' AND action='closed' AND pull_merged=1 GROUP BY repo_id, actor_id) AS mpc
ON icc.repo_id=mpc.repo_id AND icc.actor_id=mpc.actor_id) AS contribute_list
GROUP BY repo_id
ORDER BY repo_activity DESC
LIMIT 20
```

## 启动

配置后直接使用 `npm start` 启动该项目即可，此时 [`config.prod.ts`](config/config.prod.ts) 文件中的配置生效。

可以使用 `npm run dev` 进行测试，此时 [`config.local.ts`](config/config.local.ts) 文件中的配置生效。
