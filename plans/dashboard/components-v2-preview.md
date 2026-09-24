# Components V2 / Live Embed Preview

## What it is

Discord's Components V2 API lets bots send rich structured message layouts (containers, sections,
separators, media galleries, etc.) — not just the old embed format. Lumi should support authoring
these through the dashboard with a live visual preview.

## Relation to preview-before-save

See `../dashboard/preview-before-save.md`. This is the renderer component that powers the preview.
The two plans are linked — ship `preview-before-save.md` first, then extend it to Components V2 layout.

## Open questions

**ASK:**
1. Does Lumi already send Components V2 messages anywhere (check for `ContainerBuilder`, `SectionBuilder` in the codebase)?
2. Should the Components V2 editor be a structured form (add section → fill in text) or a raw JSON editor with live render?
3. Which modules would use Components V2: welcome messages only, or sticky + giveaway announcements too?

## Minimum renderer component

`apps/dashboard/src/components/ui/discord-message-preview.tsx`:
- Accepts Discord message JSON (or Components V2 component tree)
- Renders a dark Discord-style card: avatar + username + message body
- For embeds: title, description, fields, footer, thumbnail
- For Components V2 containers: nested sections, separators, buttons

## Where to find Components V2 reference

Discord docs: https://discord.com/developers/docs/components/reference  
Check `packages/core` for any existing `ContainerBuilder`/`SectionBuilder` usage.

## Build order

1. Decide on scope (ASK above)
2. Build `discord-message-preview.tsx` renderer
3. Wire into `preview-before-save.md` flow
4. Add structured Components V2 editor if needed (later)
