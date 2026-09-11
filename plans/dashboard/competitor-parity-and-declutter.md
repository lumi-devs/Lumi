# Competitor Parity + Dashboard Declutter

Continuation of live work from session `836b946a`/`5016f1c2` (2026-09-10). Read this whole
file before touching code — it supersedes assumptions in `plans/research/competitor-analysis.md`
(that file covered Zeon/Bleed/Sapphire; this one adds a live Sapphire + Wick.bot dashboard
study, done via browser automation against their real dashboards, not just marketing pages).

**No backward compatibility required. This app is pre-release alpha — breaking the Prisma
schema, the RPC contract, or any `cfg.*` module schema is explicitly authorized if it's the
right shape. Do not add migration shims, deprecated-field fallbacks, or dual-write paths
"just in case." Change it and move on.**

---

## 0. Design philosophy (read first)

This came out of directly comparing Sapphire's and Wick.bot's live dashboards (not just
reading their docs) against Lumi's. Verbatim user framing: *"see how wick and sapphire's
dashboard is easy on eyes not overloaded with info and ours is just overloading."*

Findings, condensed:

- **Sapphire is the calm one.** Single-column layouts, generous whitespace, a minimal
  green/white/gray palette, backdrop-blur modals, a persistent bottom "you have unsaved
  changes" bar. Nothing fights for attention.
- **Wick is the dense one.** Multi-column filter blocks with 5+ controls each, heavy
  color accents (red borders everywhere), everything visible at once. Feature-rich but
  reads as cluttered — this is explicitly the pattern to avoid, even though Wick's
  *feature depth* (see §2) is worth having.
- **Lumi's own manifests are large** (`security` has ~45 config fields, `filter` ~40) and
  historically rendered as flat grids regardless of whether the parent subsystem was even
  turned on. That's the actual root cause of "overloading" — not that Lumi has too many
  features, but that inactive features' config was always on screen.

**The fix already started this session**: the schema has an `enabledBy` field (a `ConfigField`
only takes effect while a named `BOOLEAN` field is `true`) that existed in the type system and
was validated at module-load time, but was never read by any renderer and was used by zero
modules. This session:
1. Wired `enabledBy` into `apps/dashboard/src/components/guild/config-group-card.tsx` — a
   field with `enabledBy` set is now **hidden entirely** (not just greyed) from both the
   toggle grid and the input grid until its governing boolean is `true` in the live
   (unsaved) form state, and an entire collapsible group hides if all its fields end up
   hidden.
2. Annotated `filter` (all `heat_*` fields gate on `heat_enabled`; `heat_multiplier_base`
   also gates on `heat_multiplier_enabled`) and `security` (every Join Gate Filter's
   enable+action pair, the whole Join Gate detail block, and the whole Verification block)
   with `enabledBy` — in the real `cfg.object({...})` schema in each module's `index.ts`,
   **not** the `manifest.json` files (see §5, those are dead for built-in modules — still
   updated for consistency but don't trust them as source of truth).
3. Dimmed (not hid — it has its own toggle in the header, no `enabledBy` chain needed) the
   `AntiNukeCard` matrix/extras when `antinuke_enabled` is off.

**⚠️ Known design conflict to resolve before extending this further**: an older, more
thorough plan (`plans/dashboard/module-agnostic-config.md`, §6 "Risks", item 2) explicitly
says *"Greying-out must not lock users out. If `antinuke_enabled` is false, an admin must
still be able to pre-configure limits before switching it on. Grey +
`aria-describedby=\"only applies while X is on\"`, still editable."* This session's
implementation **hides** dependent fields entirely rather than greying them out, which
means an admin cannot pre-fill e.g. Join Gate filter settings before turning Join Gate on —
they have to flip the toggle, fill in config, and only then does it "count." **ASK USER**
whether hide-until-enabled (simpler, more aggressive declutter, matches what Wick/Sapphire
actually do visually) or grey-but-editable (what the older plan recommends, preserves
pre-configuration) is the intended behavior. If the answer is grey-but-editable, the fix in
`config-group-card.tsx` is small: stop filtering fields out of `toggles`/`inputs`, and
instead pass a computed `disabled` prop down through `ConfigFieldInput` plus an
`aria-disabled` wrapper class (same pattern already used in `anti-nuke-card.tsx`, copy it).

**Read `plans/dashboard/module-agnostic-config.md` in full before doing any more dashboard
work in this area.** It is a much deeper, already-written plan for collapsing
`ModuleConfigForm` and `ConfigGroupCard` into one renderer, adding a schema-declared
`layout: "matrix"` (replacing `anti-nuke-card.tsx`'s heuristic `responseKeyFor`), and fixing
two real bugs (dropped `min`/`max` on number fields, wrong `revalidatePath` after save). None
of that work has been done — this session's `enabledBy` wiring is a small slice of its §3/§6,
done early because it was the single highest-leverage fix for the "overloading" complaint
and didn't require the full renderer consolidation first. **The two plans are compatible —
do the `module-agnostic-config.md` migration whenever there's room for it, and re-check that
`isFieldVisible`/hide-vs-grey logic still applies cleanly to the new `ConfigFieldRows`/
`ConfigEditor` components it introduces.**

---

## 1. What Lumi already has vs. what competitors have (corrected baseline)

Earlier research agents in this session studied Sapphire/Wick.bot's dashboards live (via
Chrome browser automation, logged into real test servers) without also reading Lumi's own
source — so their "gap" list included several things Lumi already had, sometimes in a more
advanced form. Don't re-derive this from the competitor reports; use this corrected table:

| Area | Sapphire | Wick.bot | Lumi (verified 2026-09-10) |
|---|---|---|---|
| Heat/violation scoring | — | Yes (per-signal weights, decay) | **Yes**, `packages/core/src/modules/filter/lib/heat.ts` — matches Wick's exact `1,1,11,22,44` escalation shape (see code comment), plus panic-raider mode Wick doesn't document |
| Join-condition filtering | Join Guard (AND-combined conditions, up to 5 templated filters) | Join Gate (independent per-condition toggles) | **Yes**, `security` module's "Join Gate Filters" group — 5 independent conditions (no-avatar, min-age, unverified-bot, username-pattern, advertising), each with its own action. Functionally equivalent to Wick's model; not AND-combinable like Sapphire's (see §3 for whether that's worth adding) |
| Anti-nuke | Not deeply covered in this pass | Permission monitoring, basic thresholds | **Yes, broader** — `security` covers bans/kicks/channel-deletes/role-deletes/webhook-creates/vanity-changes/dangerous-permission-grants/quarantine-bypass-attempts, each with its own threshold+response |
| Verification | Rules Screening integration only | Rendered-image captcha, heavy customization (size/font/decoys) | **Yes, different mechanism** — emoji-sequence captcha, pending role, timeout+kick, suspicious-only targeting. Do **not** build an image-rendered captcha to match Wick — it's a heavier, higher-maintenance mechanism for no proven benefit; emoji verification already works. |
| Leveling/XP | **None** | **None** | None (fine — differentiator, not a gap) |
| Welcome/goodbye + embeds | Templates/Components/Default Messages/Message Kits system | **None** | Lumi has `welcome` module — differentiator vs. Wick |
| Tickets | **None** | **None** | None — low priority, neither major competitor has it either |

## 2. Automod depth — real gaps (approved by user, priority: after §further items below)

Two things Wick has that Lumi's `filter` module genuinely lacks:

1. **Similarity-ratio spam detection.** Lumi's `heat_per_duplicate`
   (`packages/core/src/modules/filter/utilities/FilterUtility.ts`, `isDuplicate()`) only
   catches **exact** repeats via a djb2 fingerprint hash compared against the previous
   message. Wick catches reworded/copy-paste-variant spam via a configurable 0.0–1.0
   similarity ratio. Design sketched (not yet implemented) at the point this plan was
   written:
   - Add `heat_per_similar: NUMBER` (group "Heat Scoring", `enabledBy: "heat_enabled"`) and
     `heat_similarity_threshold: NUMBER` (0–1, step 0.05, default ~0.85, same group/gate) to
     `filter`'s `cfg.object({...})` schema in `index.ts` — **and mirror into
     `manifest.json` for consistency even though it's not read at runtime for built-in
     modules (see §5)**.
   - `FilterUtility.isDuplicate` currently stores only a fingerprint hash in
     `RedisKeys.filterLastMsg`. Change it to store the previous message's raw content,
     length-capped (e.g. 300 chars) to bound Redis memory and comparison cost. Rename to
     something like `checkDuplicate(guildId, userId, content): Promise<{ exact: boolean;
     similarity: number }>` — exact via string equality on the capped content, similarity
     via a bounded Levenshtein ratio (cap compared length ~200 chars for CPU safety; this is
     on the hot per-message path). There's already a `levenshteinDistance` implementation to
     crib the shape from at `packages/core/src/modules/security/lib/join-heuristics.ts`
     (built for username similarity, not message content — don't import it directly across
     module boundaries, write a filter-local equivalent, but copy the capping technique).
   - In `filter/listeners/messageCreate.ts`'s `#heat` method: if `exact`, add
     `config.perDuplicate` (existing behavior, unchanged). Else if
     `similarity >= config.similarityThreshold` and `config.perSimilar > 0`, add
     `config.perSimilar` instead (should generally be configured lower than `perDuplicate`
     since it's fuzzier — document that in the field description, don't enforce it).

2. **Zalgo / character-distribution detection.** Wick has this as a first-class filter
   signal; Lumi has none. Add a cheap check — the codebase already normalizes for
   confusables in `packages/core/src/modules/filter/lib/rules.ts` (`normalizeForMatch`,
   `\p{M}` combining-mark handling) which is exactly the building block: a message is
   "zalgo" if it has an unusually high ratio of combining marks (`\p{M}`) to base
   characters. Sketch:
   - `isZalgo(content: string, ratioThreshold = 0.5): boolean` in `filter/lib/heat.ts` or a
     new `filter/lib/zalgo.ts` — count `\p{M}` codepoints vs. total length, cheap regex
     count, no external library needed.
   - New config `heat_per_zalgo: NUMBER` (group "Heat Scoring", `enabledBy: "heat_enabled"`),
     wired into `#heat` similarly to `perEmoji`/`perLink`.
   - Consider also exposing it as a hard-filter `FilterHit` rule (like `caps`/`mentions` in
     `rules.ts`) rather than only a heat contributor, so it can trigger an immediate
     deletion+timeout independent of the heat system — **ASK USER** which behavior they
     want (heat-only signal, or a standalone hard rule with its own punishment fields like
     `caps`/`mentions` already have).

**Not worth building** (explicitly deferred, don't revisit without a new user ask):
Sapphire's "AI Moderation (Beta)" language-detection feature — LLM cost/latency, and their
own dashboard states it only scans 10 messages/minute, which doesn't fit Lumi's
high-throughput message path. Running two parallel automod systems (Discord-native +
custom) side by side the way Sapphire's UI awkwardly splits them — Lumi should keep one
unified `filter` module, which it already does.

## 3. Join Gate AND-logic — open question, do not build without an answer

Sapphire's Join Guard lets an admin combine multiple conditions with AND logic into one
templated rule (e.g. "account age < 7d AND default profile AND unverified app" → one
action). Lumi's Join Gate Filters are independent — each condition fires its own action
separately. Functionally these can express almost the same policies (an admin can just set
tighter thresholds per-condition), but not exactly the same ones (there's no way to say "only
flag accounts that are BOTH very new AND have no avatar" — either produces a flag
individually today).

**ASK USER**: is this gap worth a real feature (a small rule-builder: N conditions + one
action, replacing or supplementing the current independent-filter model), or is the current
model good enough? Given the existing Join Gate Filters group already covers 5 conditions
cleanly and the AND-combination case is a narrower edge case, default recommendation if not
asked is: **skip it**, not worth the schema/UI complexity for the marginal benefit — but this
is a judgment call for the user to confirm, not something to skip silently.

## 4. Case-management maturity (approved by user — all three, plus the whitelist note)

All four of these are genuinely missing from `packages/core/src/modules/mod/`. User
explicitly confirmed: **do not** consolidate immune/exempt-role lists across `filter`
(`exempt_roles`), `security` (`trusted_role_ids`), and this new `mod`-module list — keep
them as three separate per-module config fields. Also explicitly confirmed: immune roles
should only block **automated** escalation, never a manual staff command (`/ban`, `/warn`,
etc.) — staff can always manually act on a "protected" role's member.

1. **Predefined punishment reasons.** New `mod` config field, e.g.
   `predefined_reasons: STRING_LIST` (one reason per line). Wire into `ban`/`kick`/`warn`/
   `mute`/`quarantine` slash commands (`packages/core/src/modules/mod/commands/*.ts`) as
   Discord autocomplete suggestions on the `reason` option — check how existing autocomplete
   is wired elsewhere in the codebase (grep for `autocomplete` in `modules/mod/commands`) or
   `@sapphire/framework`'s own autocomplete pattern if nothing exists yet.
2. **Immune roles for automated actions.** New `mod` config field
   `immune_role_ids: MULTI_ROLE`. Must be checked wherever an action is triggered
   *automatically* — that means the heat system's escalation path in
   `filter/listeners/messageCreate.ts` (`#heat`), the anti-nuke response path in `security`,
   and warn-threshold auto-escalation (`packages/core/src/modules/mod/lib/thresholds.ts` /
   `warn-decay-handler.ts` — check exact file). Do **not** check it in the manual command
   handlers (`ban.ts`, `kick.ts`, `warn.ts`, etc.) — those stay unrestricted for staff, per
   the user's explicit answer.
3. **Duplicate-case confirmation window.** Before creating a new case
   (`runModerationAction.ts` or wherever cases are inserted — check
   `container.db.moderation`), query for an existing case against the same
   `guildId`+`targetId`+similar `action` created within the last N minutes (make N
   configurable, e.g. `duplicate_case_window_minutes: NUMBER`, default 5, matching
   Sapphire's default). If found, the slash command should show a confirmation prompt
   (button interaction, "A similar case was opened Nm ago by X — proceed anyway?") rather
   than silently creating a second case. This needs a real interaction-based confirm flow —
   look at `packages/core/src/modules/mod/interaction-handlers/warn-thresholds-button.ts`
   for the existing button-interaction pattern to follow.
4. **Reply-to-message quick-punish.** New Discord **message context menu command**
   (right-click a message → apps → e.g. "Punish Author"). No existing context-menu command
   exists in `mod` today (checked — only slash commands). Needs: a new file under
   `packages/core/src/modules/mod/commands/` using Sapphire's context-menu command
   registration (check `packages/core/src/lib/command-context.ts` and
   `contextMenuCommandDenied.ts`/`contextMenuCommandError.ts` listeners already present in
   `modules/core/listeners/commands/` for the surrounding infra — those exist, meaning
   *some* context-menu support is wired at the framework level even though `mod` doesn't use
   it yet). Opening it should probably show a modal or a small menu (ban/kick/warn/timeout)
   pre-filled with the message author as target — **ASK USER** exactly what the interaction
   should look like (a select-menu of actions → then the normal reason/duration modal? or
   one dedicated modal with an action dropdown built in?).

## 5. `manifest.json` files are dead for built-in modules — don't trust them

Discovered this session: `packages/core/src/modules/*/manifest.json` files look like they
should be the schema source of truth, but `manifestFromMeta()`
(`packages/core/src/lib/module-system/manifest.ts`) shows they're a **generated
serialization** consumed only by the addon/downloader system
(`packages/core/src/lib/module-system/ModuleStore.ts`, `readManifest()`) for third-party
modules installed without executing their source. Built-in modules (`filter`, `security`,
`mod`, etc.) are registered directly via their `@DefineModule` class and their `cfg.object()`
schema in `index.ts` — the checked-in `manifest.json` next to them is never read for these.
**The real source of truth is always the `cfg.object({...})` call in each module's
`index.ts`.** Edit both when changing a built-in module's schema (for documentation
consistency / in case something else does read them later) but verify behavior against the
`index.ts` schema, never against `manifest.json` alone.

## 6. Build order (per user's explicit priority: decluttering first, done; then whatever's next)

1. ~~Dashboard decluttering via `enabledBy`~~ — **done this session**, see §0.
2. Resolve the hide-vs-grey **ASK** in §0 before building anything else on top of
   `enabledBy` — it changes the implementation shape.
3. AutoMod depth (§2) — similarity-ratio spam + zalgo detection.
4. Case-management maturity (§4) — predefined reasons, immune roles, duplicate-case
   confirm, reply-to-message quick-punish, roughly in that order (reasons is the smallest;
   quick-punish needs the most new infra).
5. Decide §3 (Join Gate AND-logic) — likely skip, confirm with user first.
6. Whenever there's room: pick up `plans/dashboard/module-agnostic-config.md`'s full
   renderer consolidation — it's independent of 3-5 and can happen in parallel or after.

## 7. Screenshots

None captured this session (all competitor research was done by describing DOM structure
and interaction behavior via Chrome automation + `get_page_text`, not by saving images). If
a future session wants visual references, re-run the same browser-automation study against
`sapphirebot.com`'s dashboard and `wickbot.gg`/`dashboard.wickbot.com` (both need Discord
OAuth login + a real server with the bot invited) and use the `computer` screenshot action
this time, saving crops into `plans/research/` alongside a short caption — follow the format
that `plans/research/image-refs.md` used to use (now deleted, was fully stale/resolved).

## 8. Cross-cutting ASKs (collect before continuing)

1. §0 — hide-until-enabled vs. grey-but-editable for `enabledBy` fields.
2. §2.2 — zalgo as heat-only signal vs. standalone hard filter rule.
3. §3 — is Join Gate AND-logic worth building at all.
4. §4.4 — exact interaction shape for reply-to-message quick-punish.
