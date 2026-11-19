import tseslint from 'typescript-eslint';

// Identifiers named like money in cents: amount_cents, amountCents.
const CENTS = '/(_cents|Cents)$/';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/cdk.out/**',
      'tooling/depcruise/fixtures/**',
      'design/**',
    ],
  },
  ...tseslint.configs.strict,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  {
    // packages/domain is pure: no system clock or randomness, and no float math on cents.
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='Date']",
          message:
            'Date is forbidden in packages/domain: use Temporal and an injected Clock (ADR 0013).',
        },
        {
          selector: "MemberExpression[object.name='Temporal'][property.name='Now']",
          message: 'Temporal.Now reads the system clock: take an injected Clock instead.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'Math.random is forbidden in packages/domain (it must be pure and deterministic).',
        },
        {
          selector: `BinaryExpression[operator='/']:has(Identifier[name=${CENTS}])`,
          message: 'No float math on cents: division of a *_cents value. Use the money helpers.',
        },
        {
          selector: `BinaryExpression[operator='*']:has(Identifier[name=${CENTS}]):has(Literal[raw=/\\./])`,
          message: 'No float math on cents: fractional multiplier on a *_cents value.',
        },
        {
          selector: `CallExpression[callee.object.name='Math']:has(Identifier[name=${CENTS}])`,
          message:
            'No float math on cents: Math.* applied to a *_cents value. Use the money helpers.',
        },
        {
          selector: `CallExpression[callee.property.name='toFixed']:has(Identifier[name=${CENTS}])`,
          message: 'No float math on cents: toFixed on a *_cents value. Use formatMoney().',
        },
      ],
    },
  },
);
