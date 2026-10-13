import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['scripts/**', 'dist/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
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
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/api/permissions/Authorize.ts',
      'src/lib/api/permissions/PreconditionChecks.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'discord.js',
              importNames: ['EmbedBuilder'],
              message: 'User-facing replies are Components-v2 cards — use the make*Card helpers from #src/lib/ui/Cards.js.',
            },
            {
              name: '@discordjs/builders',
              importNames: ['EmbedBuilder'],
              message: 'User-facing replies are Components-v2 cards — use the make*Card helpers from #src/lib/ui/Cards.js.',
            },
          ],
          patterns: [
            {
              group: ['../modules/**', '../../modules/**', '../**/modules/**'],
              message:
                'Modules must not import from sibling modules. Move the shared code to src/lib/ or expose it via container.modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/rpc/**/*.ts', 'src/lib/api/permissions/**/*.ts'],
    ignores: [
      'src/lib/api/permissions/Authorize.ts',
      'src/lib/api/permissions/PreconditionChecks.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '#src/lib/api/permissions/PermitResolver.js',
              message: 'Authorization decisions go through authorize() (#src/lib/api/permissions/Authorize.js), not PermitResolver directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/lib/api/permissions/Authorize.ts',
      'src/lib/api/permissions/PreconditionChecks.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Enforce CommandContext reply helper conventions.
    files: ['src/**/commands/*.ts'],    rules: {
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
    files: ['tests/**/*.ts', 'src/**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // bun:test types vi.mock/mock.module as returning a Promise, but module mocks are hoisted and never awaited.
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', name: ['mock', 'module'], package: 'bun:test' }] },
      ],
      '@typescript-eslint/require-await': 'off',
      'no-restricted-imports': 'off',
    },
  }
);
