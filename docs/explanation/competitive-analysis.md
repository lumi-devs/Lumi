# Ember Feature & UX Competitive Analysis

**Date**: 2026-05-27
**Scope**: Ember vs major general-purpose Discord bots; high-value missing features; modern platform opportunities; premium UX patterns.

---

## 1. Major Bot Landscape — Headline Features

### MEE6 (~20M servers)
Dominant on leveling/XP and custom commands. Leveling: 15–25 random XP/message (1/min), level-up announcements, stacked role rewards, customizable rank cards. Free tier = basic moderation + leveling; premium ($11.95/mo) unlocks AI moderation, advanced rank cards, +50% personal XP. Automod covers invites, external URLs, caps spam (>70%), emoji flood, mass mentions, Zalgo, spoiler abuse — all logged to a dashboard audit log. Weakness: steep paywall.

### Carl-bot (~14M servers)
Breadth + generous free tier. Standouts: reaction roles with 5 modes (normal, unique/exclusive, verify, reversed, temporary; 250 pairs free), starboard (configurable emoji/threshold, auto-remove), logging split across multiple channels (deleted/edited messages, joins/leaves, role changes, bans, invites, purge transcripts), repeating messages, RSS/Reddit feeds, sticky messages. Custom commands: approachable template language.

### YAGPDB (~300K servers, power users)
Most configurable. Advanced Automoderator v2 = rules-as-data: conditions (patterns, regex, account age, join time, violation count, channel/role scope) + effects (mute/kick/ban/delete/role), grouped into rulesets and allow/deny lists. Up to 25 rules (150 premium), per-event modlog. Custom commands have a full Go-template scripting language (loops, conditionals, HTTP, DB keys). **Ember's biggest power-user gap.**

### Dyno (~8M servers)
Stability + dashboard depth. Auto-punishment escalation (N warns → mute → ban), protected roles, per-channel AutoDelete age policies, timed mutes, detailed modlog, giveaways, reaction roles. Best-in-class dashboard with inline config previews.

### ProBot (~3M servers)
Welcome images (background upload + avatar/username overlay via `{user}` vars), voice/text leveling, 13 languages, automod (spam/words/invites/links/caps/mentions → block/mute/timeout), auto-responder, anti-raid.

### Arcane (~2.3M servers)
Leveling specialist: 3 XP curves (linear/exponential/flat), min/max XP ranges, reaction XP, voice XP (requires N users, anti-AFK detection), per-word bonus, per-channel multipliers, free web leaderboard. Unlimited role rewards free (MEE6 paywalls these). The bar to beat if Ember adds leveling.

### Wick (security-focused)
Anti-nuke + server restore. Monitors channel/role create/delete, mass bans/kicks, webhook manipulation, vanity changes; quarantines actors within seconds. "Panic Mode" locks the server and restores from scheduled backups. Automod uses a **heat** system (score accumulates from frequency/repetition/links/emoji/mentions/caps, decays over time → avoids false positives on chatty users); progressive timeout multipliers on repeat offenders.

---

## 2. Where Leaders Exceed Ember (by category)

**Automod / filter**: per-rule violation thresholds + progressive escalation; heat/decay scoring (vs flat count); regex + allow/deny lists per rule; **Discord AutoMod API integration** (manage Discord-native rules instead of duplicating filtering in bot code — almost nobody does this); per-channel/per-role whitelists per rule.

**Moderation**: case numbers per action (`/case 42`, edit reason, export history); internal mod notes; warning expiry; undo/revoke (`/unwarn <case>` with logged removal); autopunishment rules (N warns in X days → action).

**AFK**: per-channel scope; repeated-mention cooldown; per-user rate-limited custom status. (Ember already competitive here — small gap.)

**Temp VC**: per-user settings persistence; lock/whitelist; ownership transfer; bitrate/region controls via components.

**Verification**: graduated targeting (captcha only for young/avatarless accounts); multi-method escalation (instant → captcha → web OAuth); bypass roles for trusted members. Ember likely applies one method to everyone — graduated targeting cuts friction.

---

## 3. Missing High-Retention Features — Ranked

### Tier 1 (high demand)
1. **Leveling / XP** — XP/message + cooldown, level-up announcements, role rewards, `/rank` + `/leaderboard`, rank card; voice XP differentiator. Single most reliable DAU driver.
2. **Logging / audit trails** — message delete/edit diffs, join/leave w/ account age, role/nick changes, channel CRUD, voice events; per-category channel routing; purge transcripts. Table stakes above ~1K members. (Ember logs mod actions but likely lacks event logging.)
3. **Reaction / button roles** — toggle/unique/verify/reversed/temporary modes; clean via persistent button custom IDs (Components V2).
4. **Starboard** — N-star repost to #starboard, configurable emoji/threshold/channel, auto-remove, anti-star, self-star prevention.

### Tier 2 (medium)
5. **Tickets** — panel button → private thread/channel, claiming, transcripts, intake modal, priority, auto-close.
6. **Giveaways** — timed, button entry, winner count, bonus/required roles, reroll.
7. **Autoresponder / triggers** — keyword (exact/contains/starts-with/regex) → response.
8. **Welcome images** — canvas-rendered avatar + username + member count.

### Tier 3 (lower but differentiating)
9. **Reminders** — `/remindme 2h30m ...` → DM. Low complexity.
10. **Polls** — native Discord Polls API (`poll` object on message create); far better than reaction hacks, minimal code.
11. **Economy** — high engagement, high cost; defer.

---

## 4. Underexploited Platform Capabilities

- **Components V2** (Ember already uses it — lean in): inline action buttons on mod cards (`[Escalate]`, `[View History]`), inline attachments/separators/thumbnails, ephemeral multi-step config wizards.
- **Discord AutoMod API**: expose `/automod` to create/edit/delete native rules; listen to `AUTO_MODERATION_ACTION_EXECUTION` to feed Ember's case system; offload simple keyword filtering server-side (lower latency, no message-content intent needed). *Evidence: High — stable since API v10.*
- **Native Polls API**: thin `/poll` wrapper, bar-chart results, expiry.
- **User-installable apps**: `integration_types: [USER_INSTALL]` + `contexts: [GUILD, DM, PRIVATE_CHANNEL]` → AFK/reminders/rank usable anywhere. Low effort.
- **Slash command autocomplete**: on config keys, module names, permission roles — eliminates misconfiguration; all competitors do this.
- **Onboarding integration**: gate verification role on Discord onboarding completion via `GUILD_MEMBER_UPDATE`.
- **Premium SKUs**: N/A for self-hosted; relevant only for a hosted tier.

---

## 5. Premium Moderation UX Patterns

| Pattern | Value | Effort |
|---|---|---|
| Case-based mod system (`/case`, `/history`, edit reason) | High | Medium |
| Dashboard ↔ slash parity | High | High |
| Audit-logged config changes (`X changed A→B by @admin`) | High | Low |
| Undo/revoke with soft-delete + logged removal | High | Low-Med |
| Mod-action reason enforcement (required param/modal) | Medium | Low |
| Bulk actions with confirmation preview (Components V2) | Medium | Low |
| Infraction expiry (old warns don't count to thresholds) | Medium | Medium |

---

## 6. Priority Recommendation Matrix

| Feature | Category | Value | Effort | Note |
|---|---|---|---|---|
| Full event logging | Missing | High | Med | Build first — table stakes |
| Leveling / XP | Missing | High | High | Model on Arcane |
| Reaction / button roles | Missing | High | Low | Persistent button IDs |
| Case-based mod history + `/history` | UX | High | Med | Alongside existing mod cmds |
| Starboard | Missing | Med-High | Low | |
| AutoMod API bridge | Platform | High | Low | Immediate differentiator |
| Autocomplete on config/module names | UX | High | Low | Cuts support load |
| Undo/revoke + audit trail | UX | High | Low | `/unwarn`, soft-delete |
| Audit-logged config changes | UX | High | Low | One log call in `ConfigService.setConfig` |
| Native polls | Missing | Med | V.Low | API wrapper |
| User-installable AFK/reminders | Platform | Med | Low | Per-command context flags |
| Graduated verification | Improvement | High | Low | Extend verify module |
| Progressive autopunishment | Improvement | High | Med | (Ember already has warn thresholds — extend) |
| Welcome images | Missing | Med | Med | Canvas/sharp |
| Ticket system | Missing | Med | High | Threads + claiming + transcripts |
| Autoresponder | Missing | Med | Low | |
| Giveaways | Missing | Med | Low-Med | |
| Temp VC: lock/whitelist/transfer | Improvement | Med | Low | Extend module |
| Reminders | Missing | Low-Med | Low | Per-user scheduled DM |

---

## Summary

Ember's strongest foundations vs competitors: modular architecture, Sapphire v5, and a working Components V2 card system (rare among established bots).

Three highest-leverage investments:
1. **Full event logging** — trust + admin retention above ~500 members.
2. **Leveling/XP** — most-demanded DAU driver; meet Arcane's bar.
3. **Discord AutoMod API bridge** — low code, immediate differentiation, removes message-content intent dependency for basic filtering.

Lowest-effort/highest-impact UX: autocomplete on config/module/permission options, audit-logged config changes, case-based mod history with undo.

> Note: Ember **already has** warn thresholds (`mod.warn_thresholds`) and a moderation-case system with case numbers — so "progressive autopunishment" and "case-based mod" are *extensions*, not greenfield. It also has a `rolementions` module that already integrates Discord AutoMod for protected-role mention spam, validating the AutoMod-bridge direction.

---

### Sources
MEE6 ([levels](https://wiki.mee6.xyz/plugins/levels), [moderator](https://wiki.mee6.xyz/plugins/moderator)), [Carl-bot docs](https://docs.carl.gg/), [YAGPDB help](https://help.yagpdb.xyz/), [YAGPDB automod](https://help.yagpdb.xyz/docs/moderation/advanced-automoderator/), [Dyno](https://dyno.gg/bot), [ProBot](https://probot.io/), [Arcane leveling](https://arcane.bot/features/leveling), [Arcane XP options](https://docs.arcane.bot/plugins/leveling/setup/xp-options), [Wick features](https://docs.wickbot.com/intro/features/), [Discord AutoMod API](https://discord.com/developers/docs/resources/auto-moderation), [User-installable apps](https://docs.kite.onl/guides/user-installable-apps), [Ticket bot features](https://ticketsbot.org/blog/best-discord-ticket-bot-features-2025), [Best mod bots 2026](https://blog.communityone.io/best-discord-moderation-bots-2025/).
