import { Application } from 'egg';

export default (app: Application) => {
  const { router, controller } = app;

  router.post('/query', controller.query.index);
  router.get('/query/db_schema', controller.query.dbSchema);
  router.get('/query/repo_activity', controller.query.repoActivity);
  router.get('/query/record_count', controller.query.recordCount);
  router.get('/query/most_used_label', controller.query.mostUsedLabel);

  router.get('/status', controller.status.get);
};
