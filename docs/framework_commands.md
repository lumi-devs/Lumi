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
