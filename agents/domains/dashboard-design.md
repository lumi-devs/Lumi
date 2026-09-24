# Dashboard page design

Grounded in `apps/dashboard/src/lib/config-sections.ts`,
`apps/dashboard/src/components/ui/section-tabs.tsx`,
`apps/dashboard/src/components/guild/config-group-card.tsx`,
`apps/dashboard/src/components/guild/module-config-form.tsx`, and
`apps/dashboard/src/app/guild/[guildId]/security/page.tsx` as the worked example.

## The rule

**The module's `configSchema` in `packages/core/src/modules/<name>/index.ts` is
the source of truth. The dashboard renders it.**

A page does not decide which settings exist, what they are called, how they are
grouped, which tab they sit in, or what order any of that comes in. All of it is
read off `ConfigField[]`. A field added in core must appear on the dashboard with
no dashboard change at all — if it doesn't, that's the bug.

The failure this prevents is real and has happened here: before sections existed,
`/security` hand-picked which cards to render, and
`panic_lock_mod_commands`, `panic_lock_channel_ids`, `backup_interval_hours` and
`backup_keep_count` were declared in core but rendered by nothing. They were
reachable only from `/config/modules/security`. Nothing failed; they were just
invisible.

## Two levels: `section` and `group`

`ConfigField` (`packages/contracts/src/config.ts`) carries both:

```ts
/** Fields sharing a group render together as one navigable subsection. */
group?: string;
/** Coarser split above `group`, for modules whose dashboard page is divided
 * into tabs. Groups sharing a section become subsections of one tab. */
section?: string;
```

- **`section`** → a tab on the page. Omit it everywhere and the module renders
  as one flat page, which is what most modules do.
- **`group`** → a headed subsection inside a tab. Fields with no `group` render
  as an unnamed leading block.

Declared on the field, next to everything else about it:

```ts
// packages/core/src/modules/security/index.ts
panic_lock_channel_ids: cfg.multiChannel({
  section: "Panic mode",
  group: "Panic Mode",
  label: "Channels to Lock",
  description: "Channel IDs locked by /panic. Blank locks every text channel.",
}),
```

`cfg`'s `BaseOpts` (`packages/core/src/lib/module-system/config-schema.ts:22`)
accepts both and `base()` copies them into the field meta; `fieldsFromSchema()`
flattens them into the `ConfigField[]` that both the Discord panel and the
dashboard consume. One declaration feeds both surfaces.

## Deriving the page

`sectionsOf(fields)` (`apps/dashboard/src/lib/config-sections.ts`) is the whole
derivation:

```ts
const sections = sectionsOf(module.configFields);
// → [{ name, groups: [{ name, fields }], fieldCount }]
```

Two properties matter and both are tested
(`apps/dashboard/tests/lib/config-sections.test.ts`):

- **Order is declaration order, not alphabetical.** Schema order is a design
  decision — on `/security` the Panic Mode fields are declared first so the
  control someone reaches for mid-raid is the default tab.
- **Fields of one section stay together even when declared apart.** The Panic
  Mode fields are not contiguous in the file and must not produce two tabs.

Feed the result to `SectionTabs`:

```tsx
<SectionTabs sections={sections.map(...)} ariaLabel="Security sections" />
```

`SectionTabs` takes panels as a `content` **prop**, not children, so an async
server component can render each panel server-side and pass it straight in.

## Rendering a section's settings

`ConfigGroupCard` renders named schema groups of one module. The caller picks
*which groups*; everything else — keys, labels, descriptions, widgets, ordering,
which control each `FieldType` maps to — comes from the schema:

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

Write a bespoke card only when a generic field list is genuinely worse.
`AntiNukeCard` earns it: a limit-per-action matrix beats fourteen stacked number
inputs. `JoinGateCard` does not — it is now a nine-line wrapper naming three
groups.

## The one thing that stays in the dashboard

Widgets that aren't config fields — the panic console, the verification panel
record, the backup list — can't live in the schema. Their placement is a small
map from section name to widget (`apps/dashboard/src/lib/security-widgets.ts`),
and it is the **only** place the dashboard hardcodes a security section name.

Because that map can drift from core, it is checked by test rather than trusted
(`apps/dashboard/tests/lib/security-widgets.test.ts`): every widget must name a
section the schema declares, and every declared section must be mapped. Renaming
a section in core fails a test instead of silently dropping a console.

Note the shape of that test. It reads the core module's **source text** with a
regex rather than importing it — importing would drag Sapphire and the whole bot
runtime into a dashboard test worker for the sake of some strings. It also
asserts the regex found something (`toBeGreaterThan(1)`) before asserting
anything about the result, so a schema refactor that stops matching fails loudly
instead of making every later assertion vacuously true.

## Checklist for a new or cluttered page

1. Does the module declare `section` on its fields? If the page needs tabs, add
   them **in core**, not as a list of names in the page.
2. Is the page naming settings, groups, or tabs itself? That's the smell. It
   should be reading them.
3. Is anything in the schema not rendered anywhere? That's the coverage bug
   above — a test should make it impossible.
4. Does a hardcoded string in the dashboard have to match one in core? Add a
   test that compares them.
5. Long flat page? Reach for `SectionTabs` before inventing a layout.

## Related

- `agents/workflows/adding-a-dashboard-page.md` — the page skeleton itself.
- `agents/architecture/module-system.md` — `@DefineModule` and `configSchema`.
- `agents/domains/ui-components.md` — the Discord-side equivalent, which reads
  the same `group` metadata via `sectionsFor` in `modules/core/ui/modules.ts`.
