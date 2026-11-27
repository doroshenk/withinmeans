import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

const cloudFormation = new CloudFormationClient({ region: 'us-east-2' });

/** Reads the ClusterEndpoint output of a CloudFormation stack. */
export async function lookupClusterEndpoint(stack: string): Promise<string> {
  const { Stacks } = await cloudFormation.send(new DescribeStacksCommand({ StackName: stack }));
  const value = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === 'ClusterEndpoint')?.OutputValue;
  if (value === undefined) throw new Error(`Stack ${stack} has no ClusterEndpoint output`);
  return value;
}
