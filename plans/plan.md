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

## 1 — Sticky Messages (NEW MODULE)
**Plan:** `plans/bot/sticky-messages.md`  
**Status:** plan written, not implemented

Key facts from codebase:
- New module goes in `packages/core/src/modules/sticky/`
- Follows the `@DefineModule` + `cfg.object(schema)` pattern from `welcome/index.ts`
- `renderTemplate` from `#lib/utilities/template.ts` handles `{placeholder}` vars
- Listener pattern from `filter/listeners/messageCreate.ts`

**ASK USER:**
- Should sticky posts support embeds (Components V2) or plain text only for v1?
- Per-channel stickies or one per guild?
- Should re-posting the sticky delete the old sticky message first (Zeon pattern)?

---

## 2 — Components V2 / Embed Live Preview (DASHBOARD)
**Plan:** `plans/dashboard/components-v2-preview.md`  
**Status:** plan written, not implemented

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
**Status:** plan written, not implemented

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

## 4 — Temp VCs
**Plan:** N/A — already fully implemented  
**Status:** DONE — `packages/core/src/modules/tempvc/` is a complete implementation with panel UI, voice state listeners, cleanup, registry, and dashboard RPC tests.

Nothing to do.

---

## 5 — Vanity Roles (ADDON)
**Plan:** `plans/bot/vanity-roles.md`  
**Status:** plan written, not implemented

Key facts:
- No existing module — new addon
- Needs `presenceUpdate` or `guildMemberUpdate` listener watching member's activity/status for server vanity URL
- Vanity URL available via `guild.vanityURLCode`; check if it appears in member's custom activity status or "about me"

**ASK USER:**
- Discord doesn't expose custom status/about-me in bot events — does Lumi have presence intents enabled? Check `GatewayIntentBits` in bot startup config.
- If no presence intent: vanity role isn't possible without it. Confirm intent is on or can be added.
- Should vanity role auto-remove when they remove the vanity from their status?

---

## 6 — Graduated Automod (FILTER MODULE EXTENSION)
**Plan:** `plans/bot/graduated-automod.md`  
**Status:** plan written, not implemented

Key facts from codebase:
- `filter/index.ts` already has heat scoring: `heat_warn`, `heat_timeout`, `heat_quarantine` thresholds
- `heat.ts` computes heat per message based on rule hits
- Mod module already has `warn_thresholds` (JSON map of warn count → action)
- "Graduated automod" = condition stacking is largely the heat system already

**ASK USER:**
- What's actually missing vs what the heat system already does? Is it per-rule punishment mapping (e.g., "spam filter hit → mute 10m, link block hit → warn, invite block hit → kick")?
- Or is it Sapphire-style "N violations within T seconds → escalate to next tier"?
- Should this extend `filter/index.ts` or be a separate `automod` module?

---

## 7 — `llms.txt` (DOCS APP)
**Plan:** `plans/doc-improvements/llms-txt.md`  
**Status:** plan written, not implemented

Key facts from codebase:
- Docs app is Next.js at `apps/docs/`
- Routes live in `apps/docs/src/app/`
- Generated content in `apps/docs/src/generated/` (modules.ts, commands.ts, rpc-actions.ts)
- New route: `apps/docs/src/app/llms.txt/route.ts` → static `text/plain` response

Implementation: Next.js Route Handler returning `text/plain`. Content generated at build time
from `generated/modules.ts` and `generated/commands.ts`. No special infrastructure needed.

**No open questions** — straightforward.

---

## 8 — Preview Before Save (DASHBOARD UX PATTERN)
**Plan:** `plans/dashboard/preview-before-save.md`  
**Status:** plan written, not implemented

Key facts:
- Currently config changes are committed immediately on input change (or on form submit — **confirm**)
- "Preview before save" = show a diff or rendered preview of what will change before the API write
- Nearest applicable fields: template strings (welcome message, goodbye message, any future sticky text)

**ASK USER:**
- Is config currently saved on every field blur, or on a save button per module card?
- Preview before save applies mainly to template/text fields — or should it cover all field types?
- What does "preview" look like for a channel select? (Probably N/A — text/embed fields only)

---

## 9 — Auto-Cleanup on Channel/Role Deletion (CORE PATTERN)
**Plan:** `plans/bot/auto-cleanup.md`  
**Status:** plan written, not implemented

Key facts:
- When a referenced channel or role is deleted, config fields pointing to it become stale
- Currently: shows "channel not found" (the claim flow in `plans/logging/channel-not-found-claim.md`)
- Zeon pattern: silently null out the stale ID in config rather than erroring

Listeners needed: `channelDelete` and `roleDelete` guild events → scan all module configs for that ID → set to null

**ASK USER:**
- Should auto-cleanup be silent (just nulls the field) or notify the admin in an audit/log channel?
- Should this cover all modules or start with logging + welcome (most critical)?
- Is there a config write API path that bypasses the dashboard (bot-side patch)?

---

## Cross-cutting open questions (ask before any implementation)

1. **lumi-addons location** — is `examples/` the addon workspace, or is there / should there be a
   separate `lumi-addons/` directory or repo? Affects Giveaways and Vanity Roles placement.

2. **Presence intent** — required for Vanity Roles. Is `GatewayIntentBits.GuildPresences` in the bot startup?

3. **Config save model** — save-on-blur or save-button per card? Affects Preview Before Save design.

4. **Sticky embeds** — plain text only for v1 or Components V2 from the start?
