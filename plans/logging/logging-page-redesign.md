# Logging Page Redesign

## What user wants

Every log event type lives under a **collapsible category dropdown**. Each event row has:
- A toggle (enable/disable)
- Per-event channel override select (falls back to category default → global default log channel)

Reference: another bot's logging config (images #5–#16). Key pattern:
- Top-level categories = collapsible accordion panels ("Message Events", "Member Events")
- Inside each category: one row per event with toggle + channel picker
- Category-level channel override at top of each panel
- Collapsed by default; expand on click

## What needs to change

### 1. Core schema (`packages/core/src/modules/logging/index.ts`)

Add `section` to existing fields. Add per-event channel override fields:

```
message_deletes_channel_id  cfg.channel({ group: "Message Events", label: "Channel", optional: true })
message_edits_channel_id    cfg.channel({ group: "Message Events", label: "Channel", optional: true })
member_joins_channel_id     cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
member_leaves_channel_id    cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
member_bans_channel_id      cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
member_unbans_channel_id    cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
nickname_changes_channel_id cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
role_changes_channel_id     cfg.channel({ group: "Member Events",  label: "Channel", optional: true })
```

Group-level channels:
- `message_log_channel_id` → move to group "Message Events"
- `member_log_channel_id`  → move to group "Member Events"

Keep `log_channel_id` and `ignored_channels` in "Setup".

### 2. Dashboard page

Route: `apps/dashboard/src/app/guild/[guildId]/config/modules/logging/page.tsx` (dedicated override)

- **Setup card** — default log channel + ignored channels (multi-select, fixed)
- **Per-category accordion** — one collapsible panel per group
  - Category header: group name + group-level channel override select
  - Each event row: toggle (boolean) + per-event channel override select (inline, compact)

### 3. Fix broken `ignored_channels` multiChannel select

See `../dashboard/multi-select-fix.md`.

### 4. Nav link

Add "Logging" link to Monitoring nav group in `apps/dashboard/src/lib/guild-nav.ts`.

## UI layout sketch

```
[Setup card]
  Default Log Channel: [channel select]
  Ignored Channels:    [tag combobox — searchable, chips]

[Message Events ▾]  Default channel: [select]
  Message Deletes  [toggle]  Channel override: [select or "use default"]
  Message Edits    [toggle]  Channel override: [select or "use default"]

[Member Events ▾]   Default channel: [select]
  Member Joins     [toggle]  Channel override: [select or "use default"]
  Member Leaves    [toggle]  Channel override: [select or "use default"]
  Member Bans      [toggle]  Channel override: [select or "use default"]
  Member Unbans    [toggle]  Channel override: [select or "use default"]
  Nickname Changes [toggle]  Channel override: [select or "use default"]
  Role Changes     [toggle]  Channel override: [select or "use default"]
```

## Files to touch

1. `packages/core/src/modules/logging/index.ts` — schema additions
2. `apps/dashboard/src/components/guild/config-field-input.tsx` — fix MultiIdPicker
3. `apps/dashboard/src/app/guild/[guildId]/config/modules/logging/page.tsx` — dedicated page
4. `apps/dashboard/src/components/guild/logging-category-card.tsx` — new accordion component
5. `apps/dashboard/src/lib/guild-nav.ts` — add Logging nav link
