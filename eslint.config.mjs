import tseslintParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**', '*.tsbuildinfo'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
]
