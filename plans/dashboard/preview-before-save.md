# Preview Before Save (Dashboard UX)

## What it does

For template/text fields (welcome message, goodbye message, sticky text, etc.) — show a rendered
Discord-style preview of what the message will look like before the config is committed.

## Open questions first

**ASK:**
1. Is config currently saved on every field blur/change, or on an explicit "Save" button per module card?
   (The answer determines whether "preview" is a separate UX step or just an inline render alongside the field.)
2. Should preview fire on every keystroke (debounced) or only on a "Preview" button click?
3. Do we have a Components V2 / embed renderer component already, or does this require building one?

## Proposed design (pending answers above)

For `cfg.string` fields tagged as templates (via new `preview?: true` field metadata):

- Render a "Preview" button next to the field or below it
- Clicking opens a side drawer or inline panel showing the rendered output
- For welcome/goodbye templates: call a `POST /api/guilds/[guildId]/preview` endpoint with the template
  string + fake member data; bot renders it as it would on join; return embed JSON
- Render the embed JSON in a Discord-like UI component (dark card, avatar, username, etc.)

## What needs building

| Piece | Location | Status |
|-------|----------|--------|
| `preview?: true` flag on `cfg.string` | `packages/core/src/lib/module-system/config-schema.ts` | New |
| Preview button in `ConfigFieldInput` | `apps/dashboard/src/components/guild/config-field-input.tsx` | New |
| Preview API route | `apps/dashboard/src/app/api/guilds/[guildId]/preview/route.ts` | New |
| Discord-style message renderer component | `apps/dashboard/src/components/ui/discord-message-preview.tsx` | New |

## Scope for v1

Only template string fields. Boolean/number/channel/role fields don't need preview.
