import { cruise } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Names of the dependency-cruiser rules violated by one fixture file. */
export async function violationsOf(pkg: string, file: string): Promise<string[]> {
  const ruleSet = await extractDepcruiseConfig(`${root}/.dependency-cruiser.cjs`);
  const result = await cruise([`${fixtures}${pkg}/src/${file}`], {
    ruleSet,
    validate: true,
    tsPreCompilationDeps: true,
  });
  if (typeof result.output === 'string') throw new Error('expected object output');
  return result.output.summary.violations.map((v) => v.rule.name);
}
