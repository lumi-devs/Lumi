import tseslint from 'typescript-eslint';
import baseConfig from './packages/eslint-config/index.js';

export default tseslint.config(
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
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
