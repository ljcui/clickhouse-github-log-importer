import { Application } from 'egg';

export default (app: Application) => {
  const { router, controller } = app;

  router.get('/query/db_schema', controller.query.dbSchema);

  router.get('/status', controller.status.get);
};
