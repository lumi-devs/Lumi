# Image References — What Was Pasted

## Images from session 1a6e619d (prior session, now compacted)

### Image #3 — Bot invite flow, post-OAuth tab not refreshing
- Shows the lumi guild list page with a server card that says "Invite needed" and an "Invite Lumi →" link
- Context: after completing bot invite on Discord, the dashboard tab didn't auto-refresh to show the newly-invited guild
- Fix shipped: polling/redirect after OAuth callback

### Image #4 — Breadcrumb showing "Discipline & Appeals > Appeals"
- Shows breadcrumb: `Dashboard > Discipline & Appeals > Appeals`
- Page title: "Appeals", description: "Ban and timeout appeals a punished member submitted through... deny, deny and blacklist, or dismiss each one."
- User complaint: there's no "Discipline & Appeals" nav section on the sidebar; Appeals is orphaned
- Fix needed: add Discipline & Appeals section to sidebar nav, with Appeals as a subsection

## Images from session 9cdb65e8 (prior session)

### Image — Server switcher / command palette
- Shows a `Cmd+K`-style server switcher modal
- "Search servers and settings..." input
- "SWITCH SERVER" section with servers listed: Game Server, The Aakhri Station, ReBiz's server, confessions, Test Server, Lumi Testing
- Each row shows guild name + guild ID
- "GO TO" section with "Your servers" option
- Bottom: Navigate / Select keyboard hint

### Image — Warn thresholds form row
- Shows: "At this many warns [3]  Lumi applies [Mute ▾]  For [1h]  [Add rule]"
- Context: warn threshold rule builder UI, complaint was padding was off

## Images #5–#16 — Logging config reference (from an earlier compacted session)

These were screenshots of **another Discord bot's logging configuration UI** that the user shared as design reference:

- Logging config organized as **collapsible dropdown/accordion panels per category**
- Categories seen: "Message Events", "Member Events" (and likely "Voice Events", "Server Events")
- Inside each category: individual event toggles + per-event channel override picker
- Compact design — event name, toggle, and channel select all on one row
- Categories collapsed by default, expandable by clicking the header
- No flat list of checkboxes; everything grouped behind accordions

These images drove the logging page redesign plan (see `../logging/logging-page-redesign.md`).
