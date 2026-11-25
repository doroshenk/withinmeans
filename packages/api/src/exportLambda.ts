import { S3Client } from '@aws-sdk/client-s3';
import { createDsqlDb } from '@withinmeans/db';
import { systemClock } from './clock.js';
import { env } from './env.js';
import { runExportJob } from './exportJob.js';
import { createS3ExportStore } from './exportStore.js';
import { createLogger } from './logger.js';

const deps = {
  db: createDsqlDb(env('DSQL_ENDPOINT')),
  clock: systemClock,
  store: createS3ExportStore({ client: new S3Client({}), bucket: env('EXPORT_BUCKET') }),
  logger: createLogger((line) => {
    console.log(line);
  }),
};

/** The nightly export Lambda (CDK: handler `handler`). EventBridge Scheduler's event is unused. */
export const handler = (): Promise<{ exported: number }> => runExportJob(deps);
