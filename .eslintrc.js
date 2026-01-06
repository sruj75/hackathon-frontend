/* eslint-env node */
// https://docs.expo.dev/guides/using-eslint/
const path = require('path');

module.exports = {
  extends: ['expo', 'prettier'],
  plugins: ['prettier'],
  ignorePatterns: ['/dist/*', '*.d.ts'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
  rules: {
    'prettier/prettier': [
      'error',
      {
        quoteProps: 'consistent',
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5',
        useTabs: false,
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: [path.join(__dirname, 'tsconfig.json')],
        alwaysTryTypes: true,
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      },
    },
  },
};
