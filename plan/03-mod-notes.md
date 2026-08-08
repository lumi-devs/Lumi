# Phase 3 — Mod Notes (schema + repo + RPC action + permit + UI + bot command)

**Goal:** Persistent staff-only note per member, separate from warns/cases — confirmed missing in the earlier audit (no `notes.ts` in `mod/commands/`).

Dashboard actions never touch Prisma directly — they call `rpcCall(RPC_ACTIONS.xxx, {...})`, which core handles server-side. This feature touches both sides:

1. **Schema** — `prisma/schema.prisma`: new `ModNote` model, following the `ModerationCase` model's shape (lines ~165-187) as the template — `id`, `guildId` (`@db.VarChar(20)`, `@relation` to `Guild`, `onDelete: Cascade`), `userId`, `authorId`, `message`, `createdAt`, `@@index([guildId, userId])`. Add the back-reference array to `Guild`. No tracked migrations in this repo — apply via `db:push`.
2. **Repository** — `packages/core/src/lib/prisma/repositories/ModNoteRepository.ts`, mirroring `AfkRepository.ts`'s shape (extends `Repository`, thin pass-through methods: `create`, `listForUser`, `delete`).
3. **Permit node** — add `mod.notes` to **both** `apps/dashboard/src/lib/permit-nodes.ts` (display) and `packages/core/src/lib/permissions/permit-nodes.ts` (source of truth / `KNOWN_PERMIT_NODES`). Adding it only to the dashboard list has no enforcement effect — it must also be referenced as `requiredPermit` on the new bot command and checked wherever the RPC action validates the actor's permit.
4. **Bot command** — `packages/core/src/modules/mod/commands/notes.ts`, shaped like `warn.ts`: `@ApplyOptions<ModerationCommand.Options>` decorator, `requiredPermit: "mod.notes"`, delegates to a new `NotesAction` under `../actions/index.js`.
5. **RPC action** — wire a new action into whatever dispatches `RPC_ACTIONS` (same mechanism `blocklist-actions.ts` calls into) for add/list/remove from the dashboard.
6. **Dashboard actions** — `apps/dashboard/src/actions/mod-notes-actions.ts`, structured exactly like `blocklist-actions.ts`: `"use server"`, guarded action helper, `runAction(...)` wrapper, `revalidatePath`.
7. **Dashboard UI** — new page + table component, added to **Moderation** group from Phase 1.
