/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['@sapphire'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    // Modules must be self-contained: no reaching into a sibling module.
    // Shared code lives under src/lib/, src/core/, src/db/, src/redis/, src/storage/.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/modules/*/**', '../**/modules/**', '../../**/modules/**'],
            message:
              'Modules must not import from sibling modules. Move the shared code to src/lib/ or expose it via container.modules.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // The module's own files are allowed to use relative paths within their tree.
      files: ['packages/core/src/modules/*/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../../*/**', '../../../modules/**'],
                message:
                  'Cross-module import detected. A module may only import from its own folder, src/lib/, src/core/, src/redis/, src/storage/, or src/db/.',
              },
            ],
          },
        ],
      },
    },
  ],
};
