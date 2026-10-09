---
"@lumi/core": patch
---

Fix `Cannot find package 'lumi'` for addons: data/config paths are anchored to the repo root instead of `process.cwd()`, every addon gets a `node_modules/lumi` link at spawn (a repo checkout's own `package.json` otherwise shadows the sandbox root), and the root `lumi` package exports `./events`. Also fixes discord.js v14 deprecations (`ephemeral: true`, modal `deferReply` flags), acknowledges foreign clicks on pagination/confirm prompts instead of timing them out, guards autocomplete dispatch, and resolves partial messages.
