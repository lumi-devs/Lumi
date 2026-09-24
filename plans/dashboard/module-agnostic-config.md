# Module-agnostic, uniform guild-config surface

Goal: a module adding a `cfg.*` field in `packages/core` renders correctly in the
dashboard with zero dashboard changes, and every config page reads as one product.

> **Status update (2026-09-10):** a slice of Step 6 below (`enabledBy`) has been
> implemented early, ahead of the full renderer consolidation — see
> `plans/dashboard/competitor-parity-and-declutter.md` §0 for what was done and why.
> **Important divergence**: that implementation *hides* `enabledBy`-gated fields
> entirely rather than the grey-but-editable treatment §6 Risk #2 below calls for.
> That's an open **ASK** for the user, not a settled decision — resolve it before
> doing more work here, since it affects how `ConfigFieldRows` should handle
> `enabledBy` once it's built. `pairedWith` and `layout: "matrix"` are still fully
> unimplemented (steps 2-7 below), and `anti-nuke-card.tsx` still exists.

## 0. The store is already module-agnostic

`prisma/schema.prisma:99-118` is a pure EAV table (`guild_module_config`, keyed
`[guildId, moduleName, configKey]`, `Json` value), read/written generically by
`ConfigRepository.ts:70-125` and shipped generically by `guild-rpc.ts:110-135`.
A new `cfg.*` field already reaches `DashboardModuleView.configFields` with no
store or migration work. **No Prisma change is needed for this goal.**

What is not module-agnostic is the metadata layer and its readers.

### Three readers of one schema, all disagreeing

| Reader | Reads | File |
|---|---|---|
| Discord panel | `group` only, ignores `section` | `core/ui/modules.ts:204-219` |
| `ModuleConfigForm` | `group` only, as tabs | `module-config-form.tsx:31-46` |
| `sectionsOf` | `section` → `group`, two levels | `lib/config-sections.ts:18-52` |

### Four key-name heuristics standing in for missing schema fields

1. `overrideChannelFor` — toggle↔channel pairing inferred from a `_channel_id`
   suffix (`config-group-card.tsx:19-26`).
2. `TemplateKeyPattern = /template|message|text|greeting|announcement/i` —
   decides both the template composer and row width
   (`config-field-input.tsx:32-39, 280, 475`). **Actively wrong today**: tempvc's
   `panel_message` gets the composer offering `{user} {username} {server}
   {memberCount}` chips, but its real variables are `{channel} {owner} {limit}
   {status}`. The preview lies for that field.
3. `resolveChannelTypes` — guesses voice channels from
   `key.includes("base"|"voice"|"lounge")` (`core/ui/modules.ts:393-403`).
4. `responseKeyFor` — `max_bans` → `response_bans` (`anti-nuke-card.tsx:32-34`).

### Two live bugs found while planning

- **Dropped bounds.** `cfg.number` accepts `min`/`max`, applies them to the
  Shapeshift validator, but never tags them into `FieldMeta`
  (`config-schema.ts:57-67`). So `economy.transfer_tax_percent` (min 0, max 50)
  renders a slider capped at the hardcoded `SliderFallbackMax = 100`; the user
  can drag to 100 and only finds out on save.
- **Wrong revalidation.** `setManyGuildConfigFields` revalidates
  `/guild/:id/config/modules/:moduleName` (`guild-actions.ts:73`), which is not
  where the security or logging pages live. Saving on `/security` refreshes a
  page nobody is on.

## 1. Inventory

**G** = generalisable today · **G+** = generalisable after §3 · **B** = keep bespoke

| Page / component | Verdict | Reason |
|---|---|---|
| `config/modules/[moduleName]` | **G** | The canonical generic path. Its `isLogging` branch (25-39, 48-71) is dead code — the static `logging` route wins over the dynamic segment. Delete. |
| `config/modules/logging` | **G+** | Names nothing itself; exists only because `ModuleConfigForm` can't read `section` and can't pair toggles with channels. `LogClaimsCard` stays as a widget. |
| `security` | **G+** | The `widgets` record (75-141) is genuinely page-owned (panic console, panel record, backups are RPC-backed). Sectioning is already schema-derived. Keep the page, swap the renderer. |
| `anti-nuke-card` | **G+** | Already schema-driven (`nukeRowsFor`, 39-48); only the `max_*`/`response_*` convention makes it bespoke. Becomes `layout: "matrix"`. Do this last — the matrix genuinely reads better than a flat list. |
| `config/general` + `general-settings-form` | **B** now, **G+** after Step 8 | Backed by `Guild` columns (`schema.prisma:44-48`), not EAV, and carries a real BroadcastChannel cross-tab merge (85-159). |
| `config/advanced` | **B** | Three RPC-backed record lists, no config fields. |
| `config/voice` + `tempvc-generators` | **B** | Row CRUD against `schema.prisma:477`. Correctly borrows one schema field for its default. **But** tempvc's own config fields are only reachable via `/config/modules/tempvc` — a different page with a different look. Fold them in as a section here. |
| `config/roles` + `reactionroles-manager` | **B** | Nested record editor. |
| `permits-board`, `warn-threshold-ladder`, `verification-panel-card` | **B** | Own tables. |
| `security/overrides` + `overrides-board` | **B**-ish | Already the most module-agnostic thing here — composes `ConfigFieldInput` over an arbitrary module. Keep. |
| `*-preview-playground` | **B** | Standalone demos, not wired to real values. |

Net: two pages collapse into one renderer; `security` keeps its shell but loses
`ConfigGroupCard`; `anti-nuke-card` and `config-group-card` both delete.

## 2. One renderer, not two

`ModuleConfigForm` and `ConfigGroupCard` already share `ConfigFieldInput`,
`SaveBar` and `useServerAction`. They differ in four ways, and neither is a
superset:

| | `ModuleConfigForm` | `ConfigGroupCard` |
|---|---|---|
| Sectioning | own `sectionsFor`, `group` only | caller passes `groups: string[]` |
| Layout | one `SettingRow` per field, hint as tooltip | toggle grid + 3-col input grid, hint as text |
| Save | N × `setGuildConfigField` | 1 × `setManyGuildConfigFields` |
| Chrome | search, tab strip, header + master switch | plain card title |

### Target API — `guild/config-fields.tsx` (~150 lines), replacing both

```ts
/** Pure layout. No state, no save. Renders one group's fields as rows. */
export function ConfigFieldRows(props: {
  fields: ConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
  guildId?: string;
  layout?: FieldLayout;   // from the group's fields; defaults to "rows"
}): ReactNode;

/** Stateful editor over a slice of one module's schema. */
export function ConfigEditor(props: {
  guildId: string;
  moduleName: string;
  fields: ConfigField[];  // caller filters *which*; this decides *how*
  config: Record<string, unknown>;
  title?: string;
  description?: string;
  header?: ReactNode;     // master toggle, badges
  search?: boolean;       // default: fields.length > 12
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
}): ReactNode;
```

Deliberate decisions:

- **`fields`, not `groups: string[]`.** Caller filters, editor groups internally
  from each field's own `group`. Kills `groupsFor` and the caller-supplied
  group-name coupling.
- **Layout is per-group and declared in the schema**, not chosen by the caller:
  `"rows"` (default), `"grid"` (a group of ≥6 booleans), `"matrix"` (anti-nuke).
- **One row vocabulary.** Toggle-grid cells and 3-col `Field`s both become
  `SettingRow` / `SettingRow wide`. Descriptions become `hint` tooltips
  uniformly — `input.tsx:113-116` documents exactly this rationale, and the
  logging page's column of "Override for X. Empty uses the Y channel." is the
  case it was written for.
- **Save is always `setManyGuildConfigFields`.** One RPC, one history batch, one
  validation pass. `ModuleConfigForm`'s N-parallel-calls path is strictly worse.
- **Tabs move out.** The inline strip in `module-config-form.tsx:159-190` is a
  near-duplicate of `ui/section-tabs.tsx:40-80` — its own docblock says so.
- **Search stays** inside `ConfigEditor` (it filters within a section).

Extract one shared section→tabs helper so generic/logging/security all call it:

```ts
// lib/config-sections.ts
export function configSectionTabs(opts: {
  guildId: string; module: DashboardModuleView; roles; channels;
  /** Extra nodes keyed by section name — the security page's widget map. */
  widgets?: Record<string, { before?: ReactNode; after?: ReactNode; replace?: ReactNode }>;
}): PageSection[];
```

### What breaks

1. `tests/components/config-group-card.test.tsx` (3) — assertions survive
   verbatim; only the render call and toggle-cell query change.
2. `tests/components/module-config-form.test.tsx` (10) — the 4 save tests must
   switch to `setManyGuildConfigFields`. **The one behaviour change in the
   refactor**; flag it in the commit.
3. Descriptions become tooltips on the logging page. Visible, intended.
4. `guild-actions.ts:73` must become `revalidatePath('/guild/:id', 'layout')` or
   the newly-shared save path silently fails to refresh `/security`.

## 3. Schema additions (`packages/contracts/src/config.ts`)

All additive and optional — no module compiles differently until it opts in.

```ts
export type FieldLayout = "rows" | "grid" | "matrix";

export interface ConfigField {
  // ... existing ...
  min?: number;            // NUMBER: the bounds the module actually validates
  max?: number;
  enabledBy?: string;      // takes effect only while this BOOLEAN is true
  pairedWith?: string;     // BOOLEAN: the field saying where its output goes
  layout?: FieldLayout;    // group-level; read from the group's first field
  templateVars?: string[]; // format:"template" — the placeholders it supports
  preview?: "message" | "channel" | "none";
}
```

`format` gains two documented values beside `"color"`: **`"template"`**
(explicit, replacing the regex) and **`"multiline"`** (textarea, no preview).

`config-schema.ts` changes:
- `base()` gains `enabledBy`, `layout`.
- `cfg.number` stops dropping `min`/`max` — **one line, fixes the slider bug**.
- `cfg.boolean` gains `pairedWith`; `cfg.string` gains `templateVars`, `preview`.
- **New load-time validation in `fieldsFromSchema`**: every `enabledBy` /
  `pairedWith` must name a key in the same schema, and `enabledBy` must target a
  boolean. Throw at module load — a typo'd reference should fail the boot, not
  silently render a normal row. This is what makes the declarations trustworthy
  enough to delete the heuristics.

`isWideField` becomes declarative: wide iff
`WideFieldTypes.has(type) || format === "template" || format === "multiline"`.

### Module schemas to update

| Module | Change |
|---|---|
| `logging` | `pairedWith` on the 8 event toggles; `layout: "grid"` on Message/Member Events. Kills `overrideChannelFor`. |
| `security` | `enabledBy: "antinuke_enabled"` / `"joingate_enabled"` on dependents; `layout: "matrix"` on `max_bans`; `pairedWith` on each `max_*`→`response_*`. Kills `responseKeyFor` and the whole card. |
| `welcome` | `enabledBy` on the welcome/goodbye/DM subtrees; `format:"template"` + `templateVars` on the three templates. Pins the chip list to the module that owns it. |
| `tempvc` | `format:"template"`, `templateVars:["channel","owner","limit","status"]`, `preview:"message"` on `panel_message`/`panel_title`; `["username","name","nickname","number","position"]` + `preview:"channel"` on `default_name_template`. **Fixes the wrong-preview bug.** |
| `filter` | `enabledBy: "heat_enabled"` on the 10 `heat_*` fields; `block_invites`/`block_links` on their allowlists. |
| `economy` | Nothing — its declared `min`/`max` start working once `cfg.number` tags them. |

### One shared section reader

Move `sectionsOf` into `packages/contracts/src/config.ts`; both
`core/ui/modules.ts:204-219` and the dashboard call it. The Discord panel then
respects `section` (it currently doesn't), and there is exactly one definition of
"how a schema is divided". The panel keeps `chunkSection` on top — Discord has a
component budget the web doesn't.

## 4. Uniform visual language

Keep every token in `globals.css`. This is a consistency pass, not a restyle.

| Element | Canonical | Gap to close |
|---|---|---|
| Page header | `ui/page-header.tsx` | `security:185` and `config/advanced:66` pass no `icon` — reuse the per-route icons already in `lib/guild-nav.ts:78-125` so nav and header agree. |
| Master toggle | `guild/module-master-toggle.tsx` | `ModuleConfigForm` renders its own inside the card header. Header owns it on every module page; `ConfigEditor` never renders one. |
| Section tabs | `ui/section-tabs.tsx` | Delete the duplicate inline strip. |
| Setting row | `SettingRow` (`input.tsx:117-176`) | Fold in `ConfigGroupCard`'s toggle cell and 3-col `Field`; `AntiNukeCard`'s row becomes `layout:"matrix"`. |
| Save bar | `components/save-bar.tsx` | Already universal. |
| Empty / failure | `ui/empty-state.tsx` + `PlugZap` | `config/advanced:198-208` has a local `LoadFailure` doing the same job — promote to `ui/load-failure.tsx`, delete four copies of the string. |
| Preview panel | `guild/discord-message-preview.tsx` | Currently reachable only from inside `TemplateComposer`. With `preview` declared it becomes the standard companion to any template field. |
| Entrance motion | `.rise` / `useStaggerIn` | Missing on `config/modules/*`, `config/general`, `health`, `permits`, `setup` (8 pages). Respect `general-settings-form.tsx:195-197` — never wrap a subtree containing the fixed `SaveBar`. |

Deleted by the end: `config-group-card.tsx` (234), `anti-nuke-card.tsx` (222),
the tab strip + `sectionsFor` (~70), the `isLogging` branch (~30), the section
mapping in `logging` (~25) and `security` (~38), the `LoadFailure` copies (~40),
the four heuristics (~25). **~680 lines out, ~200 in.**

## 5. Migration order

**[R]** pure refactor, tests stay green · **[B]** behaviour change, tests change

1. **`cfg.number` stops dropping `min`/`max`. [B, tiny]** Slider and number input
   use them instead of `SliderFallbackMax`.
   *Verify*: new `config-field-input.test.tsx` case — `{min:0,max:50}` renders
   `<input type="range" max="50">`. Eyeball `/config/modules/economy`.
2. **Fix save revalidation. [B, tiny]** `guild-actions.ts:73` →
   `revalidatePath('/guild/:id', 'layout')`.
   *Verify*: save on `/security`, soft reload, value persists.
3. **Move `sectionsOf` to contracts; both readers use it. [R]** Dashboard
   re-exports to keep import paths stable.
   *Verify*: `config-sections.test.ts` (7) + core panel tests green; `tsc` in
   both packages. Changes the Discord panel's section list for logging/security
   — eyeball `/modules` → Logging in Discord.
4. **Introduce `ConfigFieldRows` + `ConfigEditor`; migrate `[moduleName]`. [B]**
   Delete `module-config-form.tsx`.
   *Verify*: port its 10 tests to `config-editor.test.tsx`; the 4 save tests now
   assert one batched `setManyGuildConfigFields`. Eyeball welcome (grouped) and
   tempvc (flat).
5. **Migrate `logging` and `security`. [B]** Extract `configSectionTabs`; delete
   `config-group-card.tsx`. `AntiNukeCard` becomes `widgets.replace`.
   *Verify*: `security-widgets.test.ts` (3) must stay green **untouched** — it is
   the guard that a section rename in core doesn't orphan a widget.
6. **Declared pairing and dependencies. [B]** Delete `overrideChannelFor`,
   `responseKeyFor`, `anti-nuke-card.tsx`.
   *Verify*: new core test — `fieldsFromSchema` throws on an `enabledBy` naming a
   missing key, and on one naming a non-boolean. Port the 5 anti-nuke tests to
   drive `ConfigEditor`. Eyeball `/security` with the master toggle off and on.
7. **Declared templates and previews. [B]** Delete `TemplateKeyPattern` and the
   hardcoded `TemplateVariables`.
   *Verify*: a `STRING` named `panel_message` with **no** `format` no longer
   renders a composer (proves the regex is gone); with
   `format:"template", templateVars:["channel"]` it renders exactly one chip.
8. **(Optional) Fold guild settings into the `core` module schema. [B, larger]**
   Move `prefix`/`locale`/`timezone`/`mute_role_id` to `cfg.*` + EAV, delete the
   `Guild` columns, `updateGuildSettings`, `setGuildSettings` and
   `general-settings-form.tsx` (298 lines).
   **Cost**: a data migration; prefix resolution is on the hot message path with
   its own Redis key; and the BroadcastChannel cross-tab merge must move into
   `ConfigEditor` — where it arguably belongs for every module.
   **Recommendation: ship 1-7 first, then decide.** 1-7 deliver the whole goal
   without touching Prisma.

## 6. Non-goals and risks

**Permanently bespoke** — anything backed by its own table rather than
`guild_module_config`: reaction-role menus, permits, warn thresholds, tempvc
generators, verification panel, backups, blocklist, mod notes, appeals, ignored
channels, AFK. These are *records*, not settings. A schema that could express "a
sortable ladder of ranges with a per-rung action and conditional duration" would
be a form-builder, and a form-builder is the thing this plan exists to avoid.
Also: `PanicModeConsole` (live state, not config) and `OverridesBoard` (already
generic *over* modules; making it a `ConfigEditor` caller means teaching
`ConfigEditor` about per-target values, a second axis it should not grow).

**Where the abstraction costs more than it saves**

- `layout: "matrix"` serves exactly one group. Worth doing *only* as the thing
  that deletes `anti-nuke-card.tsx`. If Step 6 needs more than ~40 lines in
  `ConfigFieldRows`, keep the card as a `widgets.replace` node (Step 5 already
  supports that) and drop the `"matrix"` value entirely.
- **Do not add `visibleIf` / arbitrary predicates.** `enabledBy` is deliberately
  one boolean key, statically validated. The moment it accepts an expression the
  schema becomes a program and both renderers need an evaluator.
- **Do not add per-field ordering or width metadata.** Declaration order and
  `isWideField` cover it.

**Risks**

1. The panel will still ignore `enabledBy`/`pairedWith`/`layout` after Step 6.
   That's acceptable (it degrades to today), but write it in the `ConfigField`
   docblock or someone will assume the panel greys rows out too.
2. **Greying-out must not lock users out.** If `antinuke_enabled` is false, an
   admin must still be able to pre-configure limits before switching it on. Grey
   + `aria-describedby="only applies while X is on"`, still editable.
3. `SecurityWidgets` (`lib/security-widgets.ts:10-15`) matches core `section`
   strings by hand, guarded by a test. Steps 5-6 must not weaken that test.
4. **Descriptions-to-tooltips is a real regression for long descriptions** —
   `filter.regex_rules` is three lines of important caveats. Consider: tooltip
   when short, inline text past ~120 chars, measured in `SettingRow`, not
   declared in the schema.
5. Folding tempvc/reactionroles config into `config/voice` and `config/roles`
   makes `/config/modules/tempvc` redundant. Either redirect to `dashboardHref`
   or leave it — not both.
