# Lumi Implementation Master Plan

Source of truth for all pending work. Implementation agents should read the linked plan file
for each item, then ask the user any open questions marked **ASK** before writing code.

---

## How to use this file

Each section below is one unit of work. Agent picks a section, reads the linked plan, checks
open questions, implements, marks done. All code must go through the nix dev shell:

```sh
nix develop          # enter shell — sets PRISMA_QUERY_ENGINE_LIBRARY etc.
pnpm build           # turbo build across all packages
pnpm test            # run tests
```

Bot code → `packages/core/src/modules/`  
Addon code → `examples/<name>/` (or `lumi-addons/<name>/` — **ASK USER**)  
Dashboard code → `apps/dashboard/src/`  
Docs code → `apps/docs/src/`  

---

## 1 — Competitor Parity + Dashboard Declutter (DASHBOARD + CORE)
**Plan:** `plans/dashboard/competitor-parity-and-declutter.md`
**Status:** DONE — decluttering phase (the `enabledBy` wiring below) done; automod depth +
case management maturity (item 5) also done. The hide-entirely-vs-grey-but-editable ASK
was resolved as hide-entirely (see `isFieldVisible` in `config-group-card.tsx`).

Live Sapphire/Wick.bot dashboard study (browser automation, not just docs) plus a
corrected inventory of what Lumi already has vs. actually lacks. Also wired the
previously-unused `enabledBy` schema field into the dashboard renderer so dependent
config hides until its governing toggle is on — the fix for "our dashboard is
overloading." Has an open **ASK** (hide-entirely vs. grey-but-editable) that must be
resolved before extending further. Read `plans/dashboard/module-agnostic-config.md`
alongside it — that's the deeper renderer-consolidation plan this slots into.

---

## 2 — Components V2 / Embed Live Preview (DASHBOARD)
**Plan:** `plans/dashboard/components-v2-preview.md`  
**Status:** DONE — `discord-message-preview.tsx` renders Components V2 (container/section/media
gallery/separator, incl. a `---`-line syntax for `SeparatorBuilder`), wired through
`config-field-input.tsx`'s `richPreview` field-schema property. Welcome template variables
expanded (`userId`, `userAvatarUrl`, `serverId`, `serverIconUrl`) to match.

Key facts from codebase:
- Dashboard is schema-driven; `config-field-input.tsx` renders fields dynamically
- `welcomeTemplate` is a plain `cfg.string` field right now — preview would be a specialised renderer
- No live-preview UI exists yet; nearest reference: dashboard renders module config cards

**ASK USER:**
- Preview in a side panel (split view) or a modal/drawer?
- Should preview fire on every keystroke or on a debounce / "Preview" button click?
- Discord preview means rendering the embed in a Discord-like UI — do we have a Components V2 renderer component already, or build one fresh?

---

## 3 — Giveaways (ADDON)
**Plan:** `plans/bot/giveaways.md`  
**Status:** DONE — `examples/giveaway/` is the reference implementation; added a
`required_role` entry option (string+regex, validated against `requiredRoleId`) checked at
entry time in the button handler.

Key facts from codebase:
- Reference implementation already in `examples/giveaway/` — full structure: commands, interaction-handlers, scheduled-tasks, lib/store, lib/announce
- Uses `registerTaskFireHandler("giveaway-end", ...)` for scheduled end
- Entry sets are Redis-backed (ephemeral, high-churn) per comment in `store.ts`
- `examples/giveaway/` uses `import { cfg, DefineModule, Module } from "lumi"` — addon import path

**ASK USER:**
- Move `examples/giveaway/` → `lumi-addons/giveaway/` or create a new `lumi-addons/` repo?
- Does `lumi-addons` exist as a separate repo/workspace or should examples/ be the addons location?
- Any additional features beyond the example: required role to enter, bonus entries, scheduled reroll?

---

## 4 — Vanity Roles (ADDON)
**Plan:** `plans/bot/vanity-roles.md`  
**Status:** DONE (redirected per user) — not a new addon; improved the existing `promoter`
addon in the sibling `lumi-addons` repo instead (`promoter/lib/matching.ts`'s
`vanityMatchTerms()`, wired into `evaluate.ts`'s combined match terms). Added
`GatewayIntentBits.GuildPresences` to `client-options.ts` since it was missing.

Key facts:
- No existing module — new addon
- Needs `presenceUpdate` or `guildMemberUpdate` listener watching member's activity/status for server vanity URL
- Vanity URL available via `guild.vanityURLCode`; check if it appears in member's custom activity status or "about me"

**ASK USER:**
- Discord doesn't expose custom status/about-me in bot events — does Lumi have presence intents enabled? Check `GatewayIntentBits` in bot startup config.
- If no presence intent: vanity role isn't possible without it. Confirm intent is on or can be added.
- Should vanity role auto-remove when they remove the vanity from their status?

---

## 5 — Automod Depth + Case Management Maturity (FILTER + MOD MODULES)
**Plan:** `plans/dashboard/competitor-parity-and-declutter.md` (§2, §3, §4)
**Status:** DONE — similarity-ratio (Levenshtein) + zalgo detection added to `filter`'s heat
scoring (`lib/heat.ts`, `FilterUtility.ts`); predefined punishment reasons, immune roles
(`lib/moderation/immune-roles.ts`, wired into mod thresholds, filter heat escalation, and
security anti-nuke response), a duplicate-case confirmation hook on `ModerationCommand`'s
`Flow`, and a reply-to-message quick-punish context-menu command (`mod/commands/punish-author.ts`)
that runs the same hierarchy/immune-role/duplicate-case checks as the slash commands via
exported structural interfaces (`HierarchyCheckContext`/`DuplicateCaseCheckContext`) rather
than widening `CommandContext`. Graduated/escalating automod itself (the original ask) was
already fully built — `filter`'s heat system already does per-signal weighted scoring with
geometric timeout escalation and panic-raider mode; not rebuilt.

---

## 6 — Preview Before Save (DASHBOARD UX PATTERN)
**Plan:** `plans/dashboard/preview-before-save.md`  
**Status:** DONE (pre-existing, confirmed) — `config-group-card.tsx`/`module-config-form.tsx`
already use an explicit save-button model (`dirty` diff vs. baseline, `SaveBar`), not
save-on-blur; template/embed fields already get a live `ConfigFieldInput`/`TemplateComposer`
preview before save via item 2's renderer.

Key facts:
- Currently config changes are committed immediately on input change (or on form submit — **confirm**)
- "Preview before save" = show a diff or rendered preview of what will change before the API write
- Nearest applicable fields: template strings (welcome message, goodbye message, any future sticky text)

**ASK USER:**
- Is config currently saved on every field blur, or on a save button per module card?
- Preview before save applies mainly to template/text fields — or should it cover all field types?
- What does "preview" look like for a channel select? (Probably N/A — text/embed fields only)

---

## 7 — Auto-Cleanup on Channel/Role Deletion (CORE PATTERN)
**Plan:** `plans/bot/auto-cleanup.md`  
**Status:** DONE (pre-existing, confirmed) — `core/lib/config-cleanup.ts` +
`core/listeners/channelDelete.ts`/`roleDelete.ts` already scan all module configs and null
out the stale reference on deletion.

Key facts:
- When a referenced channel or role is deleted, config fields pointing to it become stale
- Currently: shows "channel not found" — the self-claim recovery flow for that case is
  already fully implemented (see `apps/dashboard/src/components/guild/channel-picker.tsx`
  and `packages/core/src/lib/logging/claims.ts`); this item is only about the *other* half
  — proactively nulling out a stale reference the moment the channel/role is deleted,
  before anyone notices it's broken
- Zeon pattern: silently null out the stale ID in config rather than erroring

Listeners needed: `channelDelete` and `roleDelete` guild events → scan all module configs for that ID → set to null

**ASK USER:**
- Should auto-cleanup be silent (just nulls the field) or notify the admin in an audit/log channel?
- Should this cover all modules or start with logging + welcome (most critical)?
- Is there a config write API path that bypasses the dashboard (bot-side patch)?

---

## Cross-cutting open questions — resolved

1. **lumi-addons location** — both: `examples/` stays the addon-starter/reference workspace
   (Giveaways); real production addons (Vanity Roles → `promoter`) live in the sibling
   `lumi-addons` repo, symlinked in as `.lumi`.

2. **Presence intent** — was missing; added `GatewayIntentBits.GuildPresences` to
   `client-options.ts`.

3. **Config save model** — explicit save-button per card (`SaveBar` + dirty diff), not
   save-on-blur.
