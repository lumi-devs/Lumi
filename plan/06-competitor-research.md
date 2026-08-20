# Competitive research — Wick, Red-DiscordBot, Skyra (2026-08-20)

Background research feeding the phases in this directory and future addon-ecosystem/dashboard work. Not itself a phase to "land" — a reference other phases can cite. Sources are linked inline in each section; this is a synthesis, not a re-derivation, of three independent research passes plus a read of Lumi's current code.

## Where Lumi already stands

Nine core modules (`core`, `mod`, `filter`, `security`, `logging`, `afk`, `tempvc`, `utility`, `dashboard`, see `docs/modules.md`), a permit-node permission system decoupled from raw Discord permission bits (`packages/core/src/lib/permissions/`), and a third-party addon/repo download system (`core/commands/repo.ts`, `download.ts`) mirroring Redbot's cog-downloader model by name (`lumi`'s exports are deliberately shaped like `redbot.core`/`redbot.core.commands`).

**Update, post-verification:** the two stale worktrees (`agent-a73fc5d83fec0bc6d`, `agent-a010d62716476e832`) have been removed. Their uncommitted `lumi-wick-parity-moderation` changeset looked like unlanded Wick-parity work, but a direct diff against `main` showed otherwise: Heat System v2, anti-nuke hardening, backup/restore, join gate expansion, verification modes, and the guided setup wizard are **all already merged into `main`** (commits `00093d2`, `d8b465e`, `3ba93c8`, `0e7b810`/`fed0b0b`, and the setup-wizard/health-check pages already exist in `apps/dashboard`) — predating even today's bug-hunter fixes. The worktree diff itself wasn't additive; it *removed* the panic-mode serialization lock and re-show-if-active guard, removed the `verifiedRoleId` safety check before kicking on verification timeout, and dropped `position` tracking on role/channel restore — i.e. it would have reintroduced three real bugs, including the exact one today's bug-hunter commit `a9d76ea` (B-BUG-2/B-BUG-3) just fixed. Discarded, not merged.

## Wick — security-only, not a competitor on breadth

Wick is five pillars and nothing else: Anti-Nuke, Auto Moderator (Heat System), Verification, Join Gate, Join Raid. No tickets, giveaways, leveling, or economy — it doesn't compete as a general-purpose bot, only on raid/nuke defense depth. ([features](https://docs.wickbot.com/intro/features/), [setup](https://docs.wickbot.com/setup/))

Verified against current `main` (not the discarded changeset). Status:

1. ~~Panic Mode full lockdown~~ — **done.** `SecurityService.executePanic` already does the channel-permission-level lockdown with a serialization lock and re-show-if-active guard, not just a command lock.
2. ~~Security Scan~~ — **done.** `apps/dashboard/src/app/guild/[guildId]/health/` + `health-check-list.tsx` already exist.
3. ~~Guided Setup wizard~~ — **done.** `apps/dashboard/src/app/guild/[guildId]/setup/page.tsx` + `setup-wizard.tsx` already exist.
4. **"Advertising account" detection in Join Gate — genuine gap, confirmed absent** (`grep -rn advertis packages/core/src/modules/security` returns nothing). A distinct signal from username-pattern matching: flags accounts whose bio/status/custom-status itself is a spam-ad vector, not just a name pattern.
5. Wick calls its backup/restore feature "**imaging**" — worth using that term in parity-claim docs/marketing copy, since it's the term their audience searches for.
6. Positioning point, not a code gap: Lumi's edge over Wick isn't "more moderation" — parity is already reached — it's that Lumi is modular/general-purpose *and* has this security depth, where Wick has to stay narrow.

## Red-DiscordBot — the architectural reference for the addon SDK

Lumi's addon SDK already mirrors Redbot's cog model by name. Confirmed patterns worth adopting: ([cog creation](https://docs.discord.red/en/stable/guide_cog_creation.html), [Config reference](https://docs.discord.red/en/stable/framework_config.html), [Permissions cog](https://docs.discord.red/en/stable/cog_guides/permissions.html), [Downloader cog](https://docs.discord.red/en/stable/cog_guides/downloader.html))

1. **Scoped Config with atomic mutation context managers** — `async with config.guild(g).some_list() as l:` auto-persists on exit, exception-safe. Lumi's guild config is a Postgres-backed, Redis-cached per-module blob (`redis.ts`'s `guildConfig(module, guildId)`) — typed via Prisma, which Redbot's stringly-typed generic KV isn't, but without an equivalent atomic-mutation helper for addon authors. Worth a thin wrapper if addon code currently does read-modify-write by hand.
2. **Rule-based Permissions layer, decoupled from Discord's role hierarchy, with precedence** (user > channel > role > server-wide; global rules beat guild rules) and bulk YAML import/export. Lumi's permit-node system already covers the "decoupled from raw permission bits" part — the gap, if any, is precedence layering and bulk import/export, not the core concept.
3. ~~Per-cog isolated Config namespace~~ — **already covered.** `redis.ts`'s `guildConfig(module, guildId)` key and the Postgres row it backs are keyed by module name per guild, so addon config is namespace-isolated by construction; no separate identifier scheme needed.
4. **A hosted, auto-crawled community index** (`index.discord.red`, crawls a `repositories.yaml`-style list every 15 min) decoupled from the bot's own in-repo registry — lighter-weight than building and moderating a marketplace inside Lumi itself.
5. ~~Repo pin / granular update commands~~ — **already covered.** `/module pin`/`/module unpin` (`DownloaderService.setModulePinned`, which `updateModule` already checks and refuses to touch a pinned module without an explicit revision), plus `/module update <name|all>` and `/repo update <name|all>` for per-module vs. per-repo vs. everything granularity.

## Skyra — same framework, different scope (not a superset)

Skyra runs on the Sapphire *Framework*, same as Lumi, but the team splits features across a family of bots (Acrysel/Artiel/Nekokai/Iriss/Teryl/Nayre) rather than one monolith — worth considering if any future Lumi feature area (fun/games, social) risks bloating the core bot rather than being addon-shaped. Notable specifics: ([skyra-project org](https://github.com/skyra-project))

1. **Decision: keep Lumi's dashboard RPC split, don't fold it into the bot process.** Skyra bundling `routes/`/`serializers/` into the bot itself is simpler, but Lumi's requirement is that the bot must run standalone with or without the dashboard app up — the `dashboard` module already being independently disableable (per `docs/modules.md`: disabling it "only disables the RPC surface, not the web app itself") is the right shape for that and should stay as-is, not get merged toward Skyra's model.
2. **Discord-message live preview — confirmed absent, build it.** `find apps/dashboard/src -iname "*preview*" -o -iname "*discord-message*"` returns nothing. Skyra's `discord-components` idea (render exactly what a template will look like in Discord) is worth adding as a shared component for message-template editors (welcome messages, embeds, verification panels).
3. Their advanced custom-commands/"tags" system is **archived** — built, then retired, at comparable scale. Signal against sinking significant effort into a Lumi tags feature.
4. No starboard, no giveaways, despite being a "kitchen sink" bot — tempers the idea that Skyra is a strict superset to catch up to. It diverges from Lumi (leveling with canvas-rendered rank cards, music with `.squeue` export/import, simple games/economy) more than it dominates.
5. Their dashboard is a heavy SPA with nothing extractable via fetch — no visual lessons there.

## Dashboard visual direction (bold SaaS-style, per team decision)

Two important caveats surfaced during research, both worth reading before acting on them:

- **`sapph.xyz`'s "Sapphire" is an unrelated Discord bot by a different team/company than the Sapphire *Framework* (sapphirejs.dev) Lumi is built on.** Same name, no other connection. The reference was already framed this way in `plan/00-open-question.md`, so this isn't a new mix-up — just flagging it explicitly before a designer builds against it.
- **Dyno's dashboard (`dyno.gg`) is blocked by Cloudflare bot-protection** — WebFetch and curl both got 403s. No verifiable colors/type/layout could be pulled. **Do not design against fabricated specifics for Dyno** — a human needs to grab live screenshots first, same method as the original Wick teardown (docs + HAR + screenshots).

What *was* confirmed, from live CSS:

- **Sapph.xyz marketing site**: blue→cyan→violet gradient family (`#0099FF, #0094FF, #00C2FF, #00F0FF, #00FFF0, #7583FF`), **Quicksand** headings (Raleway fallback) — rounded, geometric-soft, not a generic Inter/system-font look. Mixed 10–20px card radius and full-pill (50/100px) buttons. Recurring hexagon SVG motif. Hero → stat band (1.77M servers / 623M users) → partner logos → 6-card feature grid → closing CTA.
- **dashboard.sapph.xyz — the actual dashboard, and it deliberately looks nothing like the marketing site**: dark palette reusing **Discord's own theme colors** (`#2f3136`/`#202225` backgrounds, `#dcddde` text, `#72767d` muted) so the dashboard reads as an extension of Discord itself. Accent is a separate teal→blue gradient (`#00fed0` → `#0093ec`) for buttons/active states, popped hard against the neutral dark base. Different type family from the marketing site: **Onest**, plainer than Quicksand. UI is config-tile cards (`SettingTile`, 8–15px radius) with `ToggleElement`/`ChannelSelector`/`RoleElementNew`/`DurationSelector`/`DynamicDropdown` primitives, a **live Discord-message preview** next to template editors, and inline tooltip help icons. It's a config-tile dashboard with live preview, not a stats/analytics dashboard.

Implication for the paused `plan/00-open-question.md` decision: if "bold SaaS-style" means the dashboard itself (not just a marketing page), Sapphire's own dashboard is actually a case *against* naively porting marketing-site boldness into the authenticated app — their dashboard bold move was a strong accent gradient against a Discord-native dark base plus a live message-preview pattern, not Quicksand/hexagons/pill-buttons everywhere. Worth deciding whether "bold" for Lumi means marketing-site energy inside the dashboard, or Sapphire-dashboard-style (native-feeling dark base + one strong accent gradient + live-preview components) before touching `globals.css` tokens. Dyno reference still needs real screenshots before it can inform anything.

## Decisions taken (2026-08-20) and actual remaining scope

- Stale worktrees: **discarded** (removed, branches deleted) — confirmed regressive, not salvageable.
- Dashboard: **bold SaaS-style**, but scoped as Sapphire-dashboard-style (native-dark base + one strong accent + live-preview components), not marketing-site energy — Dyno still needs real screenshots before its tokens are used.
- Dashboard architecture: **stays RPC-split**, bot must run with or without the dashboard app.
- Skyra's tags/custom-commands precedent: **no action** — not building a tags feature.

Real remaining implementation work, everything else above is already shipped. Status as of this pass:

1. ~~Advertising-account detection in Join Gate~~ — **done.** `filter_advertising_enabled`/`filter_advertising_action` config + `hasAdvertisingIndicators()` heuristic (`security/lib/join-heuristics.ts`), wired into `evaluateJoinFilters`.
2. ~~Atomic guild-config mutation helper~~ — **done.** `ConfigRepository.mutateModuleConfig` and `GuildKVRepository.mutateModuleData`, both Redis-lock-guarded read-modify-write.
3. ~~Permit bulk import/export~~ — **done**, scoped deliberately: `/permit export` / `/permit import` (JSON, custom permits + role assignments only - built-ins are excluded since `ensureBuiltinPermits` recreates them automatically). **Full precedence layering + deny rules (user > channel > role > server-wide, global > guild) was deliberately NOT built in this pass** - it changes the security semantics of every `hasPermit` call in the bot (new target type, new deny concept, likely a schema migration) and doesn't belong in the same PR as everything else here without dedicated review. Left as a follow-up with this design note for whoever picks it up.
4. ~~Repo pin / granular update commands~~ — **already existed**, no work needed (see above).
5. Discord-message live-preview component for template editors — **not built, and deliberately so.** Checked for a consumer first: Lumi has no user-editable Discord-message-producing feature anywhere yet (no welcome/goodbye messages, no custom embeds; `/verifypanel`'s content is fixed server-side, not a template). Building a generic preview component with nothing to attach it to would be dead code shipped speculatively. Correct sequencing: build this alongside whichever feature first introduces an editable message template, not before.
6. ~~Docs~~ — **done.** "Imaging" terminology + a new Backup & restore section in `docs/modules.md`; dashboard-optional architecture decision documented in `docs/dashboard.md`; Join Gate filter list updated.
