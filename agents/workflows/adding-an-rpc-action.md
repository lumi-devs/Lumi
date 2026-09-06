# Adding an RPC action (dashboard ↔ worker)

Full mechanics: `agents/architecture/rpc-bridge.md` — read that first, this is
the condensed step-by-step using the same real action it walks through end to
end: `guild.modNotes.add` (a mutation) and its sibling `guild.modNotes.list`
(a read), both in the mod-notes feature.

Three files change, always in this order (each step only compiles once the
previous one exists):

## 1. Contract entry — `packages/contracts/src/rpc.ts`

Add the payload interface, then wire it into both maps:

```ts
// near the other payload interfaces, rpc.ts:397-408
export interface ModNoteListPayload {
  userId: string;
}
export interface ModNoteAddPayload {
  userId: string;
  message: string;
}
export interface ModNoteRemovePayload {
  id: number;
}
```

```ts
// RpcRequestPayloads, rpc.ts:563-565
"guild.modNotes.list": ModNoteListPayload;
"guild.modNotes.add": ModNoteAddPayload;
"guild.modNotes.remove": ModNoteRemovePayload;
```

```ts
// RpcActions, rpc.ts:649-651
guildModNotesList: "guild.modNotes.list",
guildModNotesAdd: "guild.modNotes.add",
guildModNotesRemove: "guild.modNotes.remove",
```

Action string convention: `<domain>.<resource>.<verb>`, dot-notation,
lowerCamel resource/verb (`guild.modNotes.add`, not `guild.mod_notes.ADD`).
`RpcActions` is the actual export name callers import — there is no
`RPC_ACTIONS` SCREAMING_CASE constant despite the naming pattern elsewhere in
the repo; don't guess that name.

## 2. Handler — `packages/core/src/lib/rpc/core-rpc.ts` or a `dashboard` module RPC file

Guild-scoped actions (the overwhelming majority) go in
`packages/core/src/modules/dashboard/rpc/<domain>-rpc.ts` (`moderation-rpc.ts`
for mod-notes, blocklist, cases; also `guild-rpc.ts`, `permits-rpc.ts`,
`security-rpc.ts`, `tempvc-rpc.ts`, `reactionroles-rpc.ts`, `audit-rpc.ts`,
`logging-rpc.ts`) inside that file's `register*RpcHandlers()` function. Only
bot-owner-only, non-guild-scoped actions (GDPR, downloader/repo management,
system panel, `auth.whoami`) go directly in `packages/core/src/lib/rpc/core-rpc.ts`,
registered once from `LumiClient`'s boot sequence instead of the `dashboard`
module's `onLoad`.

Real handler, `moderation-rpc.ts:92-114`:

```ts
registerRpcHandler(RpcActions.guildModNotesAdd, async (req) => {
  const guildId = requireGuildId(req.guildId);
  const actorId = await requireGuildManager(guildId, req.actorId);
  const { userId, message } = parsePayload(ModNoteAddSchema, req.data);

  await container.db.ensureGuild(guildId);
  const note = await container.db.modNotes.create(guildId, userId, actorId, message);
  return {
    success: true,
    note: {
      id: note.id, userId: note.userId, authorId: note.authorId,
      message: note.message, createdAt: note.createdAt.toISOString(),
    },
  };
});
```

Four things every handler does, in this order:

1. `requireGuildId(req.guildId)` (`helpers.ts:35`) — throws if the wire request
   has no `guildId` at all; every guild-scoped action needs this even before
   auth.
2. Authorization — `requireGuildManager(guildId, req.actorId)` (`helpers.ts:47-64`)
   re-derives the actor's *live* guild membership/permissions from the bot's
   own cache, not anything cached in the dashboard session. Some actions are
   deliberately public instead — `guild.appeals.verify`/`guild.appeals.submit`
   (`moderation-rpc.ts:126,147`) skip this and rely on a signed per-case appeal
   token because a punished user has no dashboard access at all. Decide which
   your action is; don't default to public just because it's simpler.
3. `parsePayload(SomeSchema, req.data)` — a Shapeshift schema
   (`helpers.ts:406-417` for the mod-notes ones) that re-validates the payload
   server-side. `dispatchRpc` never validates `req.data` for you — skip this
   and the handler has zero request-shape validation regardless of what the
   TypeScript contract type claims. Define the schema next to the others in
   `packages/core/src/modules/dashboard/lib/helpers.ts` if it's guild-scoped.
4. Do the actual work through `container.db.*` (never `container.prisma`
   directly — see the repo-wide anti-pattern in `AGENTS.md`) and return a plain
   JSON-serializable object. Dates go out as `.toISOString()`, never a raw
   `Date`.

If you throw for a user-facing reason, throw a plain `Error("clean message")`
— it crosses the wire verbatim. A raw Prisma error is deliberately scrubbed by
`dispatchRpc` before reaching the caller, so don't rely on a Prisma exception's
message being useful to the dashboard.

Register the corresponding teardown in that file's `unregister*RpcHandlers()`
(`rpcHandlers.delete(RpcActions.guildModNotesList)`, `moderation-rpc.ts:311`) —
every handler needs a matching delete or a module reload leaks a duplicate
registration.

## 3. Caller — read vs. mutation

**Read** → `apps/dashboard/src/lib/dashboard-fetch.ts`, a plain async function,
optionally wrapped in React's `cache()` if multiple Server Components might
request the same data in one render:

```ts
export async function getGuildModNotes(
  guildId: string, actorId: string, userId: string,
): Promise<ModNoteView[]> {
  const data = (await rpcCall(RpcActions.guildModNotesList, {
    guildId, actorId, data: { userId },
  })) as { notes: ModNoteView[] };
  return data.notes;
}
```

No `"use server"`, no rate limiting, no `revalidatePath` — reads never do
either. Add the return-shape type (`ModNoteView` here) to
`apps/dashboard/src/lib/dashboard-data.ts` if it's new.

**Mutation** → a new or existing file under `apps/dashboard/src/actions/*.ts`,
`"use server"` at the top, each export wrapped in `runAction`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { RpcActions } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedModNotesAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function addModNote(guildId: string, userId: string, message: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedModNotesAction(guildId);
    await rpcCall(RpcActions.guildModNotesAdd, {
      guildId, actorId: session.userId, data: { userId, message },
    });
    revalidatePath(`/guild/${guildId}/moderation/notes`);
    return { ok: true };
  });
}
```

`session.userId` becomes the wire `actorId` — never take an `actorId` as a
parameter from the client. `runAction` (`apps/dashboard/src/lib/action-result.ts:8-19`)
converts a thrown `Error` into `{ ok: false, error }` while still letting
Next's `redirect()`/`notFound()` throws pass through. `revalidatePath` after a
successful write is what makes the dashboard page reflect the change without a
full reload; reads never call it because they don't mutate anything.

## That's the whole change

No code generation, no schema registry to update elsewhere, no need to touch
`dispatchRpc`/`http-server.ts` — those are transport-level and already handle
any action string generically. If the new action needs a permission check
beyond plain guild-manager (bot-owner-only, a specific permit node), that's a
handler-level decision (see the "gotchas" in `agents/architecture/rpc-bridge.md`),
not a wire-shape one.
