import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import baseConfig from './packages/eslint-config/index.js';

export default tseslint.config(
  {
    ignores: ['scripts/**', 'dist/**', 'coverage/**', 'apps/dashboard/.next/**'],
  },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        // `project: true` resolves each file against its *nearest* tsconfig,
        // so apps/dashboard's DOM/React project is used for its own files
        // rather than this root one.
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
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
    // `next lint` was removed in Next 16, so the App Router rules it used to
    // provide are wired up directly here.
    files: ['apps/dashboard/src/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router only — the rule hunts for a `pages/` directory and warns
      // on every run when it finds none.
      '@next/next/no-html-link-for-pages': 'off',
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
