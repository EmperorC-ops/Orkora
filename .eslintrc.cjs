/**
 * Shared root ESLint config for every workspace package except the Next.js app
 * (apps/web keeps its own `next lint` config). This is intentionally a lenient,
 * "adopt incrementally" baseline: it parses TypeScript/TSX across api, mobile,
 * and the shared libs and surfaces useful issues as WARNINGS so CI stays green
 * while the codebase is brought up to standard. Promote rules to "error" over
 * time once the warnings are cleared.
 *
 * No `extends` of recommended rule sets on purpose: those ship many rules at
 * error severity that the existing code would trip, which would turn CI red.
 * We enable a small, high-signal set as warnings instead.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  ignorePatterns: [
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/*.config.*',
    '**/*.d.ts',
    '**/*.js',
    '**/*.jsx',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'no-debugger': 'warn',
    'no-var': 'warn',
    'prefer-const': 'warn',
    eqeqeq: ['warn', 'smart'],
  },
};
