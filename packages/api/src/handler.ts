import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ContextDeps } from './context.js';

export function createHandler(
  _deps: ContextDeps,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  throw new Error('not implemented');
}
