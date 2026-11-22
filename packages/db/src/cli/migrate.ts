import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { createDsqlDb } from '../dsql.js';
import { migrate } from '../migrate.js';
import { runMigrateCli } from './migrateCli.js';

const cloudFormation = new CloudFormationClient({ region: 'us-east-2' });

await runMigrateCli(process.argv.slice(2), {
  async lookupEndpoint(stack) {
    const { Stacks } = await cloudFormation.send(new DescribeStacksCommand({ StackName: stack }));
    const value = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === 'ClusterEndpoint')?.OutputValue;
    if (value === undefined) throw new Error(`Stack ${stack} has no ClusterEndpoint output`);
    return value;
  },
  connect: (endpoint) => createDsqlDb(endpoint),
  migrate,
  log: (line) => console.log(line),
});
