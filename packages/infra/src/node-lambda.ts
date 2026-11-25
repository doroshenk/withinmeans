import { fileURLToPath } from 'node:url';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { OutputFormat, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/**
 * What our Lambdas share. esbuild bundles the entry file and what it imports into one file.
 * arm64 (Graviton) is the cheaper architecture; the Node 24 runtime matches local dev.
 */
export function nodeLambdaDefaults(entry: string) {
  return {
    entry: fromRoot(entry),
    depsLockFilePath: fromRoot('pnpm-lock.yaml'),
    handler: 'handler',
    runtime: Runtime.NODEJS_24_X,
    architecture: Architecture.ARM_64,
    memorySize: 512,
    // ESM output: our db package reads import.meta.url, which CommonJS output would empty.
    // The banner gives bundled CommonJS dependencies (pg) a working require().
    bundling: {
      format: OutputFormat.ESM,
      minify: true,
      sourceMap: true,
      // Bundle the AWS SDK too: the runtime does not ship the DSQL signer.
      externalModules: ['pg-native'],
      banner:
        "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  } satisfies NodejsFunctionProps;
}
