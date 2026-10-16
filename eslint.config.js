const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  { ignores: ['node_modules/**', 'android/**', 'ios/**', 'dist/**', '.expo/**', 'eval/out/**'] },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // The eval CLI is a Node script whose job is to print results.
  { files: ['eval/**', 'scripts/**'], rules: { 'no-console': 'off' } },
];
