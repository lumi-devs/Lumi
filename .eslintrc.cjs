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
  overrides: [
    {
      // Commands reply through CommandContext / the Base* helpers so slash and
      // prefix behave identically; raw interaction replies bypass that, and
      // ephemerality is owned by the reply helpers (ephemeralCard, ctx.reply,
      // this.reply*) — never OR the flag in a command. Low-level card/flag
      // primitives (cards.ts, ping-cards.ts, pre-deferred-interactions.ts) are
      // intentionally not commands and define the flags the helpers apply.
      files: ['packages/core/src/**/commands/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            // Ephemerality of a *reply* is owned by the helpers — never OR the
            // flag into a reply/editReply/followUp payload. (deferReply legitimately
            // takes { flags: Ephemeral } and has no card, so it is not matched.)
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
