# Framework: i18n

One locale today (`en-US`); per-guild language resolves through
`fetchLanguage`. All user-facing strings go through the typed `LumiT`
functions - never hardcode reply text.

```ts
const t = await ctx.fetchT();
await ctx.replySuccess(t("commands:doneTitle"), t("commands:doneBody"));
```

`applyLocalizedBuilder` localizes slash command builders. Namespaces live
under `src/languages/en-US/` (`afk`, `commands`, `common`, `core`,
`filter`, `logging`, `panels`, `preconditions`, `tempvc`, ...).
`translate` / `getT` cover non-command paths (listeners, tasks,
schedulers).
