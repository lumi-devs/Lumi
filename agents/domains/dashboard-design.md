# Dashboard page design

> The dashboard lives in its own repository, [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard).
> Paths below (`src/...`) are relative to that repository's root; the schema they
> derive from (`configSchema`, `ConfigField`, `sectionsOf`) lives in `@lumi/contracts`.

Grounded in `src/lib/config-sections.ts`,
`src/components/ui/section-tabs.tsx`,
`src/components/config/config-group-card.tsx`,
`src/components/config/module-config-form.tsx`, and
`src/app/guild/[guildId]/security/page.tsx` as the worked example.

---

## The rule

**The module's `configSchema` in `packages/core/src/modules/<name>/index.ts` is
the source of truth. The dashboard renders it.**

A page does not decide which settings exist, what they are called, how they are
grouped, which tab they sit in, or what order any of that comes in. All of it is
read off `ConfigField[]`. A field added in core must appear on the dashboard with
no dashboard change at all.

---

## Two levels: `section` and `group`

`ConfigField` (`packages/contracts/src/config.ts`) carries both:

```ts
/** Fields sharing a group render together as one navigable subsection. */
group?: string;
/** Coarser split above `group`, for modules whose dashboard page is divided
 * into tabs. Groups sharing a section become subsections of one tab. */
section?: string;
```

- **`section`** $\rightarrow$ a tab on the page. Omit it everywhere and the module renders
  as one flat page, which is what most modules do.
- **`group`** $\rightarrow$ a headed subsection inside a tab. Fields with no `group` render
  as an unnamed leading block.

Declared on the field in core:

```ts
// packages/core/src/modules/security/index.ts
panic_lock_channel_ids: cfg.multiChannel({
  section: "Panic mode",
  group: "Panic Mode",
  label: "Channels to Lock",
  description: "Channel IDs locked by /panic. Blank locks every text channel.",
}),
```

---

## Deriving the page

`sectionsOf(fields)` computes declared sections and groups:

```ts
const sections = sectionsOf(module.configFields);
// → [{ name, groups: [{ name, fields }], fieldCount }]
```

Feed the result to `SectionTabs`:

```tsx
<SectionTabs sections={sections.map(...)} ariaLabel="Security sections" />
```

---

## Rendering a section's settings

`ConfigGroupCard` (`src/components/config/config-group-card.tsx`) renders named schema groups:

```tsx
<ConfigGroupCard
  guildId={guildId}
  moduleName="security"
  title={`${section.name} settings`}
  groups={section.groups.flatMap((g) => (g.name ? [g.name] : []))}
  config={config}
  configFields={configFields}
  roles={roles}
  channels={channels}
/>
```
