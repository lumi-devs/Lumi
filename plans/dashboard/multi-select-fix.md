# Multi-Channel / Multi-Role Select Fix

## Problem

`ConfigFieldInput` renders `FieldType.MultiChannel` (and `MultiRole`) via `MultiIdPicker`.
`MultiIdPicker` uses `<Select multiple>` from `#/components/ui/input` — which:

1. Fixed `h-8` height shows only 1 row
2. `ChevronDown` icon overlaid obscures the list
3. Requires Ctrl+click — non-obvious UX
4. For channels: users don't know channel IDs

## Fix

Replace with a **tag combobox** pattern:

```
[Search channels...  ▾]
[#general ×] [#logs ×] [#mod-log ×]
```

- Clicking the trigger opens a filterable dropdown of available options
- Selecting adds it as a chip/tag with × to remove
- Already-selected items excluded from the dropdown
- Works for channels (`#name`), roles (`@name`), raw IDs (MultiUser fallback stays as text input)

## Implementation

New component: `apps/dashboard/src/components/ui/multi-select.tsx`

```ts
interface MultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}
```

Wire from `ConfigFieldInput`:
- `FieldType.MultiChannel` — options from `channels` prop, label = `#${name}`
- `FieldType.MultiRole` — options from `roles` prop, label = `@${name}`
- `FieldType.MultiUser` — keep existing text-input-to-add-by-ID (no options list available)

## Files

| File | Change |
|------|--------|
| `apps/dashboard/src/components/ui/multi-select.tsx` | New component |
| `apps/dashboard/src/components/guild/config-field-input.tsx` | Wire MultiChannel + MultiRole to MultiSelect |
