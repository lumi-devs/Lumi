import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Disable any type errors for now
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      'no-constant-binary-expression': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'no-empty': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      // Ensure modules are self-contained.
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
          paths: [
            {
              name: 'discord.js',
              importNames: ['EmbedBuilder'],
              message: 'User-facing replies are Components-v2 cards — use the make*Card helpers from #utilities/cards.js.',
            },
            {
              name: '@discordjs/builders',
              importNames: ['EmbedBuilder'],
              message: 'User-facing replies are Components-v2 cards — use the make*Card helpers from #utilities/cards.js.',
            },
          ],
        },
      ],
    },
  },
  {
    // Enforce CommandContext reply helper conventions.
    files: ['packages/core/src/**/commands/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Ephemerality is owned by helpers.
          selector: 'CallExpression[callee.property.name=/^(reply|editReply|followUp)$/] MemberExpression[object.name="MessageFlags"][property.name="Ephemeral"]',
          message: 'Do not OR MessageFlags.Ephemeral into a reply — wrap the card with ephemeralCard() or use the reply helpers.',
        },
        {
          selector: 'CallExpression[callee.object.name="interaction"][callee.property.name="reply"]',
          message: 'Commands must reply via ctx.reply*/this.reply* helpers, not raw interaction.reply.',
        },
      ],
    },
  },
  {
    // Allow relative imports within a module's own folder.
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
  }
);
