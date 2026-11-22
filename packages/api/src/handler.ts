import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { createContextFactory, type ContextDeps } from './context.js';
import { appRouter } from './router.js';

/** CloudFront forwards `/api/*` to API Gateway unchanged; tRPC wants the path without it. */
function withoutApiPrefix(event: APIGatewayProxyEventV2): APIGatewayProxyEventV2 {
  const rawPath = event.rawPath.replace(/^\/api(?=\/|$)/, '') || '/';
  return { ...event, rawPath };
}

export function createHandler(
  deps: ContextDeps,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  const createContext = createContextFactory(deps);
  const { logger } = deps;
  const trpc = awsLambdaRequestHandler({
    router: appRouter,
    createContext: ({ event }) => createContext(event.headers.authorization),
    // Only the kind of error, where it happened and its message: never inputs, bodies or
    // database row details, and the logger drops money fields regardless.
    onError({ error, path }) {
      const original = error.cause ?? error;
      // Expected rejections (not signed in, bad input) are not faults.
      const fields = {
        code: error.code,
        path,
        name: original.name,
        message: original.message,
      };
      if (error.code === 'INTERNAL_SERVER_ERROR') logger.error('request failed', fields);
      else logger.info('request rejected', fields);
    },
  });
  return async (rawEvent) => {
    const event = withoutApiPrefix(rawEvent);
    const result = await trpc(event, {} as Context);
    logger.info('request', {
      method: event.requestContext.http.method,
      path: event.rawPath,
      status: result.statusCode,
    });
    return result;
  };
}
