module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '.eslintrc.cjs', 'e2e', 'playwright.config.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // `const { a: _a, ...rest } = obj` is how we omit a key; the discarded
        // binding is the point, not an oversight.
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // shadcn/ui primitives export their cva variants next to the component,
      // which only costs a full HMR reload of that one file.
      files: ['src/components/ui/**/*.tsx'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
}
