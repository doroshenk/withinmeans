/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'only-db-imports-db-drivers',
      comment:
        'Only packages/db may import pg or the Aurora DSQL connector (CLAUDE.md, architecture rules).',
      severity: 'error',
      from: { pathNot: '(^|/)packages/db/' },
      to: { path: '(^|node_modules/)(pg|pg-[^/]+|@aws/aurora-dsql-[^/]+)(/|$)' },
    },
    {
      name: 'domain-is-pure',
      comment: 'packages/domain may not import db, api, web, infra or any AWS SDK.',
      severity: 'error',
      from: { path: '(^|/)packages/domain/' },
      to: {
        path: [
          '^@withinmeans/(db|api|web|infra)(/|$)',
          '(^|/)packages/(db|api|web|infra)/',
          '(^|node_modules/)@aws-sdk/',
          '(^|node_modules/)aws-cdk-lib(/|$)',
        ],
      },
    },
  ],
  options: { tsPreCompilationDeps: true, doNotFollow: { path: 'node_modules' } },
};
