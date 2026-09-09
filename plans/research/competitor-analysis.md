# Competitor Analysis: Zeon · Bleed · Sapphire

---

## Modules Lumi Should Add

### High priority (clear user demand, competitors all have it)

- **Music** — Zeon has a full music stack (10 platforms: YouTube, Spotify, Apple Music, SoundCloud, Deezer, Amazon Music, etc.), 11+ audio filters (Bassboost, Nightcore, 8D, Vaporwave, Karaoke, EQ presets), real-time synced lyrics panel, 247 mode, autoplay. Lumi has no music module.
- **Social media notifications** — Sapphire: Twitch/YouTube/TikTok with live-updating messages (stream status edits in-place rather than posting a new message each time). Bleed T3: Instagram posts + stories. Zeon: notifier module. None of these in Lumi.
- **Giveaway module** — Zeon has a full `giveaway` module. Bleed has one too. Not in Lumi.
- **Ticket system** — Bleed has an extremely deep tickets system (panels, options, forms, lifecycle states, trainee permissions, transcripts, per-staff claim profiles). Zeon also has tickets. Lumi has none.
- **Bump reminder** — Bleed: auto-remind every 2h for DISBOARD `/bump`, with autolock (restrict messaging between bumps) and autoclean (delete non-bump messages). Very common request for small/growing servers.
- **VoiceMaster** — Bleed + Zeon: Join-to-Create VC provisioning. User joins a hub channel → bot creates a personal temporary VC, cleans up on empty. Zeon's `vc-role` assigns a role while a user is in VC (auto-removes on leave).
- **Vanity roles** — Zeon: auto-assign a special role when a member sets the server's vanity URL as their status. Flex reward for active community members.
- **Auto-react** — Zeon: up to 6 emojis per trigger word/phrase, 20 triggers per server, case-insensitive substring match, 3s cooldown. Lumi has no equivalent.
- **Sticky messages** — Zeon: pin a message that re-posts itself whenever someone else posts in that channel (useful for rules, pinned announcements). Extremely commonly requested.
- **Media-only channels** — Zeon: enforce that a channel only accepts image/video attachments, deletes anything else automatically.
- **Guild tag** — Zeon: enforce a tag in all member display names (e.g. `[GUILD]`). Auto-rename on join/name change, configurable prefix/suffix.
- **Anti-nuke** — Zeon has 11 micro-filters + Z+ Lockout Mode (mass action detection) + Betrayal Guards (flags rogue staff). Lumi's security module scope unclear — this level of granularity would be a differentiator.
- **Join DM** — Zeon: send a DM to members when they join. Lumi's greet is channel-only.
- **Boost greet** — Zeon: dedicated boost announcement (separate from regular join greet). Different message template, targets boosting specifically.
- **Auto-responder** — Zeon: trigger replies on exact phrase match with full variable interpolation + `{embed:name}` embed injection. 20 triggers per server. Lumi has nothing similar.
- **Auto-delete (antibot)** — Zeon: auto-remove all bot messages from designated channels, with whitelist for exceptions (e.g. music bot). Trigger is bot authorship, not a timer.
- **Reaction roles** — Zeon has a `reaction-role` module. Bleed has one. Commonly expected feature; unclear if Lumi has it.

### Medium priority

- **AI / ChatGPT integration** — Bleed T1+: ChatGPT responses directly in Discord. Growing expectation.
- **Last.fm integration** — Bleed: rich embed scripting for now-playing — `{track.name}`, `{album.cover}`, custom reactions per track. Niche but loved by music communities.
- **Video → GIF + background removal** — Bleed T2+: media manipulation. Unusual differentiator.
- **Automod graduated punishment** — Both Zeon (heat system) and Sapphire (10+ modules, condition-based punishment stacking) have graduated automod. Lumi should have escalating warn → mute → kick → ban based on configurable thresholds.

---

## UX Patterns Worth Copying

**Preview before save** — Zeon shows a live preview of the resulting embed/message before saving any config change. Zero friction for non-technical users. High value, low implementation cost in a dashboard context (just render the embed preview component).

**Non-destructive disable** — Zeon preserves all module config when a module is toggled off. Re-enabling it restores everything exactly as before. Never force the user to reconfigure. Lumi should do this everywhere.

**Auto-cleanup on deletion** — Zeon: if a channel or role referenced in config gets deleted, the entry is automatically removed from the config rather than leaving a broken ID. Lumi currently surfaces a "channel not found" error — should instead detect and self-heal.

**Dangerous-role blocklist** — Zeon's auto-role module has a hardcoded blocklist of roles that can never be auto-assigned (admin, mod, etc.), regardless of config. Good safety net.

**`{embed:name}` reusable template system** — Zeon: define a named embed once, reference it anywhere across any module with `{embed:name}`. Reusable message templates are a major power-user feature that reduces repetitive config. Lumi should consider a global embed library.

**Interactive dropdowns for config** — Zeon: `.automod manage` opens Discord component-based dropdowns for filter toggling rather than requiring text commands. No command memorization.

**Per-staff ticket profiles** — Bleed: when a staff member claims a ticket, their personal profile can override the ticket's category, rename template, and message. Fine-grained ownership UX.

**3-tier priority resolution** — Bleed tickets: option-specific roles > global staff roles. Lumi logging already plans this (event channel → category channel → default channel) — extend this pattern across other modules.

**Settings persistence across bot removal** — Bleed: when bot leaves a server (inactivity removal or deliberate), config is preserved server-side and restored on reinvite. Important for trust.

**Per-server bot identity** — Bleed: server owners can set a custom avatar, banner, and bio for Bleed *within their server*. Architecturally complex but creates strong perceived ownership.

**`llms.txt` doc endpoint** — Bleed publishes `https://docs.bleed.bot/llms.txt` — a machine-readable plain-text version of their docs for AI assistants. Easy to add, signals modernity.

**Trainee permission tier** — Bleed tickets: a "trainee" role that can view/claim/close tickets but is explicitly restricted from elevated actions. Granular enough to onboard new staff safely without giving them full perms.

---

## Doc Improvements for Lumi

**Add a quick-start** — Neither Zeon nor Bleed buries users in a module index. Both lead with a clear "here's how to get the first thing working in 3 steps." Lumi docs should open with: `1. Invite 2. /setup 3. Pick one module to configure` — working state in under 2 minutes.

**Document the permission hierarchy** — Zeon clearly explains its 5-level permission system (Owner → Extra Owner → Trusted → Admin → Member) up front. Lumi should have an equivalent page explaining who can configure what.

**Troubleshooting page per module** — Bleed documents module-specific failure modes (iOS Smart Punctuation breaking flags, mute bypass root causes, VoiceMaster permission inheritance). Users hit these constantly. Add a "Common Issues" section per module — not generic "check bot permissions."

**Explain the resolution fallback chain** — For logging (and anywhere Lumi has tiered fallback): document explicitly that event channel → category channel → default channel. Users need to understand why their events are going to the "wrong" channel.

**Publish `llms.txt`** — Bleed does it. One static route, plain-text export of docs. AI assistants will answer user questions about Lumi correctly.

**Module limit tables** — Zeon documents hard limits per module (e.g. "20 auto-react triggers per server", "10 autodelete channels max"). Lumi should do the same — users hit undocumented limits and think it's a bug.

**Variable reference table** — Zeon and Bleed both publish complete variable reference tables (`{user.name}`, `{server.memberCount}`, etc.) in one place. Collect all Lumi template variables into a single reference page.

---

## Performance / Architecture Ideas

**Proactive library caching (Sapphire)** — Sapphire explicitly documents that emoji/sticker data is pre-cached rather than fetched live per-request. For logging at scale (80+ event types, 1.8M servers), live Discord API calls per log event would be a bottleneck — cache guild resource lists on join/update events.

**Lavalink for audio** — Zeon uses Lavalink for all audio. If Lumi adds music, Lavalink is the only reasonable path — handles buffering, filters, reconnects, and multi-node scaling.

**Event-scoped rate limiting** — Zeon documents a 3-second per-user cooldown on auto-react and auto-responder triggers. This is the right pattern for any message-triggered action — implement per-user, per-trigger rate limits at the module level to avoid API abuse.

**Background sync task isolation** — Zeon honestly documents that synced lyrics uses a background polling task that runs until stopped, with explicit rate-limit caveats. Lumi should isolate expensive polling/sync operations into dedicated workers with circuit breakers.

---

## Zeon — Feature Surface

Full module list: music (10 platforms, 11+ filters, synced lyrics, 247 mode), automod (13 filters, heat system, granular whitelists), antinuke (11 micro-filters, Lockout Mode, Betrayal Guards), auto-delete (bot message removal), auto-react, auto-responder, auto-roles (dangerous-role blocklist), boost-greet, giveaway, greet (rich templates), guild-tag (enforce display name prefix/suffix), join-dm, leave-message, logging, media-only, notifier (social media), reaction-role, sticky-message, tickets, vanity-roles, vc-role.

Config UX: dot-prefix commands (`.`), up to 5 custom prefixes, interactive dropdown panels for most config, `{embed:name}` global template system, preview-before-save, non-destructive disable. 5-level permission hierarchy.

Doc quality: strong. Per-module command reference, explicit hard limits, variable reference tables, troubleshooting-adjacent notes on edge cases.

---

## Bleed — Feature Surface

Comma prefix (`,`). Core: moderation, welcome/goodbye, reaction roles, embed scripting DSL, VoiceMaster.

**Config system highlights:** per-server bot identity (custom avatar/banner/bio, server-owner only), bump reminder with autolock + autoclean, iOS Smart Punctuation documented as a known failure mode.

**Ticket system** (most complex of the three):
- Panels → Options (5 categories: Behavior, Form, Messages, Style, Convert)
- 7 lifecycle stages: Open, Claim, Unclaim, Move, Close, Reopen, Delete
- Per-staff claim profiles (override category/rename/message per claimer)
- Trainee permission tier (view/claim/close gated independently)
- 3-tier role priority: option-specific Staff > option-specific Trainee > global Staff
- Transcript generation on every delete, even without log channel
- Forms: pre-creation intake with conditional scripting (`{if}/{elseif}/{else}/{/if}`)
- Custom message DSL: `$v{title:}`, `$v{description:}`, conditional rendering, form variable access

**Donator tiers (T1/T2/T3):** ChatGPT integration, Last.fm embed scripting, video→GIF, background removal, VoiceMaster Ghost, custom personal prefix (global across servers), Instagram notifications (posts + stories), early command access.

**Settings persistence:** config survives bot removal and is restored on reinvite.

**`llms.txt`** published for AI-readable docs.

---

## Sapphire — Feature Surface

Scale: 1.8M servers, solo developer (Xge), completely free core, custom branding at €5/mo (cosmetic — custom bot name/avatar/status).

**Standout logging:** 80+ distinct event types (vs typical bots' 20–30). Per-entity filtering: filter log output by specific user, role, or channel — more granular than Lumi's `ignored_channels` list.

**Automod:** 10+ modules with condition-based graduated punishment (not just "mute on trigger" — stacks conditions).

**Social notifications:** Twitch, YouTube, TikTok. Stream messages update in-place (edit the notification to show "went offline" rather than posting a new message).

**Message editor:** every bot message editable in-place via built-in editor — no reconfiguration needed to tweak wording.

**Premium model:** purely cosmetic (custom branding). All functionality is free. This is why they're at 1.8M servers — zero feature gates.

**Docs:** JS-rendered SPA, not crawlable. No sitemap. Command reference not available statically. This is a doc weakness for them — Lumi can beat them here.
