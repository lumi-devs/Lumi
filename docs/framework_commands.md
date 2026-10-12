# Framework: Commands

Commands live in `commands/`, one file per command, each exporting a
`CommandDef`. Every command is slash + prefix natively.

```ts
export const myDef: CommandDef = {
  name: "mycmd",
  description: "What it does.",
  guildOnly: true,
  requiredPermit: "mymodule.use",
  cooldownMs: 5_000,
  cooldownBucket: { limit: 3, windowMs: 60_000, scope: "user" },
  build: () => new SlashCommandBuilder().setName("mycmd").setDescription("..."),
  run: async (ctx) => {
    const name = await ctx.getString("name", { required: true });
    await ctx.replySuccess("Done", `Hello ${name}.`);
  },
};
```

Cooldown scopes are `user` (default), `guild`, `channel`, or `member`.
Every invocation passes the `AccessLists` → `MaintenanceMode` →
`ModuleEnabled` → permit gates before `run`. Missing Discord permissions
are reported with the offending list, not silence.

## Follow-up prompts

`src/lib/utilities/Predicates.ts`, built on the native
`awaitMessages`/`awaitMessageComponent` collectors:

```ts
import { awaitYesNo, awaitInt, awaitChoice, awaitReply, awaitButton } from "#lib/utilities/Predicates.js";

const ok = await awaitYesNo(channel, userId, { prompt: "Proceed?", timeoutMs: 30_000 });
const n = await awaitInt(channel, userId, { min: 1, max: 10 });
const pick = await awaitChoice(channel, userId, ["red", "blue"]);
const text = await awaitReply(channel, userId, { match: /^[a-z]+$/ });
const clicked = await awaitButton(message, userId, ["confirm", "cancel"]);
```

`confirmPrompt` (`src/lib/utilities/Confirm.ts`) is the card-styled yes/no
path; predicates are the plain-text path.

## Before-invoke hooks

`src/lib/commands/Hooks.ts` is a named registry of `beforeInvoke`
checks. Each hook receives the `CommandContext` and returns a
`{ reason }` denial or `null`; `runBeforeInvokeHooks(ctx)` returns the
first denial in registration order:

```ts
import { addBeforeInvokeHook, removeBeforeInvokeHook } from "#lib/commands/Hooks.js";

addBeforeInvokeHook("my-check", (ctx) => null);
removeBeforeInvokeHook("my-check");
```

The registry is intentionally unwired: dispatch calls
`runBeforeInvokeHooks(ctx)` and reports the denial, which is owned by
the dispatch/unload wiring pass, not by hook authors.

## Help visibility

`/help` lists only the commands the invoker may actually run. Filtering
reuses the existing `authorize()` path (`canSeeCommand` in
`src/modules/core/commands/Help.ts`): guild-only commands hide outside
servers, owner commands hide from non-owners, permit commands hide without
the node, and commands from guild-disabled modules hide. Empty sections
drop out; the card shape and pagination are unchanged.

## Unknown-command suggestions

A prefix invocation that matches no command stays silent unless it is
close to a real command name. `didYouMean(input, names)` and
`suggestSimilar(input, names, limit = 3)` (`src/lib/utilities/DidYouMean.ts`)
score lowercase command names with prefix-aware edit distance and a strict
threshold (max distance 1–3 by input length, shared first letter required
for inputs of 3 characters or fewer), so `!kik` suggests `/kick` while
`!zzzzzz` stays silent. The reply lists up to 3 candidates.

## Local error handlers

`onCommandError(name, handler)` (`src/lib/commands/CommandDispatch.ts`)
registers a per-command handler consulted before the global error card.
Return `true` to swallow the error; return `void`/`false` or rethrow to
fall through to the global handler (a rethrow replaces the reported
error). It returns an unsubscribe function. With no handler registered,
global behavior is identical.

```ts
import { onCommandError } from "#src/lib/commands/CommandDispatch.js";

const off = onCommandError("ban", async (error) => {
  if ((error as Error).message.includes("hierarchy")) {
    return true;
  }
});
```
