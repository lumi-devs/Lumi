"use client";

import { useEffect, useRef, useState } from "react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { ChevronRight, Expand, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input, Textarea } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
  DiscordMessagePreview,
  type PreviewButton,
  type PreviewContainer,
  type PreviewV2Component,
} from "#/components/guild/discord-message-preview";
import { ChannelPicker, channelOptionsFor } from "#/components/guild/channel-picker";
import { MultiSelect } from "#/components/ui/multi-select";
import { MessageBuilderV2 } from "#/components/guild/message-builder-v2";
import type { DashboardRoleView, DashboardChannelView } from "#/lib/dashboard-data";

/** Used only by sliders on fields whose module declares no `max`. */
const SliderFallbackMax = 100;

const WideFieldTypes = new Set<FieldType>([
  FieldType.ObjectArray,
  FieldType.StringList,
  FieldType.MultiRole,
  FieldType.MultiChannel,
  FieldType.MultiUser,
  FieldType.ComponentsV2Blocks,
]);

/** True when the widget stacks its own rows (a list editor, a tag picker, the
 * template composer with its preview) and so needs the full row width rather
 * than the narrow control column a switch or a select fits in. */
export function isWideField(field: ConfigField): boolean {
  if (WideFieldTypes.has(field.type)) return true;
  return (
    field.type === FieldType.String &&
    (field.format === "template" || field.format === "multiline")
  );
}

export function ConfigFieldInput({
  field,
  value,
  onChange,
  roles = [],
  channels = [],
  guildId,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
  guildId?: string;
  /** The module's full config record, keyed by field key. Only consulted for
   * `format: "template"` fields that declare `richPreview` sibling keys. */
  config?: Record<string, unknown>;
}) {
  switch (field.type) {
    case FieldType.Boolean:
      return (
        <Switch
          id={field.key}
          checked={Boolean(value)}
          onChange={onChange}
          aria-label={field.label}
        />
      );

    case FieldType.Enum:
      return (
        <Select
          id={field.key}
          aria-label={field.label}
          className="max-w-64"
          value={typeof value === "string" ? value : ""}
          onValueChange={(next) => onChange(next)}
          options={(field.choices ?? []).map((c) => ({ value: c, label: c }))}
          placeholder="Select…"
        />
      );

    case FieldType.Number: {
      if (field.step !== undefined) {
        const numeric = Number(value);
        const shown = Number.isFinite(numeric) ? numeric : 0;
        return (
          <div className="flex w-full items-center gap-2">
            <Input
              id={field.key}
              type="range"
              min={field.min ?? 0}
              max={Math.max(field.max ?? SliderFallbackMax, shown)}
              step={field.step}
              value={shown}
              aria-label={field.label}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            <output
              htmlFor={field.key}
              aria-live="polite"
              className="w-12 shrink-0 text-right text-[14px] text-fg-muted tabular"
            >
              {shown}
            </output>
          </div>
        );
      }
      return (
        <Input
          id={field.key}
          type="number"
          className="tabular"
          min={field.min}
          max={field.max}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );
    }

    case FieldType.Duration: {
      const picks = field.quickPicks ?? [];
      const shown = typeof value === "string" ? value : "";
      const listId = `${field.key}-picks`;
      return (
        <div className="flex w-full flex-col gap-1.5">
          <Input
            id={field.key}
            type="text"
            placeholder="e.g. 15m"
            className="tabular"
            value={shown}
            list={picks.length > 0 ? listId : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {picks.length > 0 ? (
            <>
              <datalist id={listId}>
                {picks.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1" role="group" aria-label={`${field.label} presets`}>
                {picks.map((pick) => (
                  <Button
                    key={pick}
                    type="button"
                    variant={shown === pick ? "primary" : "ghost"}
                    size="sm"
                    aria-pressed={shown === pick}
                    onClick={() => onChange(pick)}
                  >
                    {pick}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      );
    }

    case FieldType.MultiRole: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <MultiSelect
          value={selected}
          onChange={onChange}
          options={roles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
          placeholder="Search roles…"
          aria-label={field.label}
        />
      );
    }

    case FieldType.MultiChannel: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const options = channelOptionsFor(field, channels);
      return (
        <MultiSelect
          value={selected}
          onChange={onChange}
          options={options.map((c) => ({ id: c.id, label: `#${c.name}` }))}
          placeholder="Search channels…"
          aria-label={field.label}
        />
      );
    }

    case FieldType.MultiUser: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <MultiTextPicker
          fieldKey={field.key}
          fieldLabel={field.label}
          selected={selected}
          onChange={onChange}
        />
      );
    }

    case FieldType.StringList: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <MultiTextPicker
          fieldKey={field.key}
          fieldLabel={field.label}
          selected={selected}
          onChange={onChange}
        />
      );
    }

    case FieldType.Role: {
      const shown = typeof value === "string" ? value : "";
      return (
        <Select
          id={field.key}
          aria-label={field.label}
          className="max-w-64"
          value={shown}
          onValueChange={(next) => onChange(next || null)}
          options={[
            { value: "", label: "None" },
            ...roles.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
      );
    }

    case FieldType.Channel:
      return (
        <ChannelPicker
          field={field}
          value={value}
          onChange={onChange}
          channels={channels}
          guildId={guildId}
        />
      );

    case FieldType.String: {
      const shown = typeof value === "string" ? value : "";
      if (field.format === "color") {
        return (
          <ColorPicker
            fieldKey={field.key}
            fieldLabel={field.label}
            shown={shown}
            fallback={typeof field.default === "string" ? field.default : "#5865F2"}
            onChange={onChange}
          />
        );
      }
      if (field.format === "template") {
        return (
          <TemplateComposer
            fieldKey={field.key}
            fieldLabel={field.label}
            variables={field.templateVars ?? TemplateVariables}
            shown={shown}
            onChange={onChange}
            richPreview={resolveRichPreview(field.richPreview, config)}
          />
        );
      }
      if (field.format === "multiline") {
        return (
          <Textarea
            id={field.key}
            rows={4}
            aria-label={field.label}
            value={shown}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
      if (field.format === "image") {
        return (
          <ImageUrlInput
            fieldKey={field.key}
            fieldLabel={field.label}
            shown={shown}
            onChange={onChange}
          />
        );
      }
      return (
        <Input
          id={field.key}
          type="text"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    case FieldType.ComponentsV2Blocks:
      return (
        <MessageBuilderV2
          value={value}
          onChange={onChange}
          templateVars={field.templateVars}
          fieldLabel={field.label}
        />
      );

    case FieldType.ObjectArray: {
      const entries = Array.isArray(value) ? value : [];
      const subfields = field.subfields ?? [];
      const blank = Object.fromEntries(
        subfields.filter((s) => s.default !== undefined).map((s) => [s.key, s.default]),
      );
      return (
        <div className="flex w-full flex-col gap-3">
          {entries.map((entry, i) => (
            <ObjectArrayEntry
              key={i}
              index={i}
              record={
                typeof entry === "object" && entry !== null
                  ? (entry as Record<string, unknown>)
                  : {}
              }
              subfields={subfields}
              parentKey={field.key}
              channels={channels}
              roles={roles}
              guildId={guildId}
              onChange={(next) =>
                onChange(entries.map((e, j) => (j === i ? next : e)))
              }
              onRemove={() => onChange(entries.filter((_, j) => j !== i))}
            />
          ))}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onChange([...entries, blank])}
            >
              Add entry
            </Button>
            <p aria-live="polite" className="text-[13px] leading-4 text-fg-subtle">
              {entries.length === 0
                ? "Empty list"
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
            </p>
          </div>
        </div>
      );
    }

    default: {
      const shown = typeof value === "string" ? value : "";
      return (
        <Input
          id={field.key}
          type="text"
          placeholder="User ID"
          className="font-mono text-[14px]"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }
}

/** One row of an OBJECT_ARRAY field (e.g. a sticky-message channel entry).
 * Collapsible so a list of many entries stays scannable — the header shows
 * the entry's own CHANNEL subfield value (resolved to a name) when it has
 * one, since that's the field users actually identify entries by. */
function ObjectArrayEntry({
  index,
  record,
  subfields,
  parentKey,
  channels,
  roles,
  guildId,
  onChange,
  onRemove,
}: {
  index: number;
  record: Record<string, unknown>;
  subfields: ConfigField[];
  parentKey: string;
  channels: DashboardChannelView[];
  roles: DashboardRoleView[];
  guildId?: string;
  onChange: (next: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const channelField = subfields.find((s) => s.type === FieldType.Channel);
  const channelName = channelField
    ? channels.find((c) => c.id === record[channelField.key])?.name
    : undefined;

  return (
    <div className="overflow-hidden rounded-panel border border-border">
      <div className="flex items-center justify-between gap-2 bg-bg-subtle px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight
            aria-hidden
            className={`size-3.5 shrink-0 text-fg-subtle transition-transform duration-fast ${
              open ? "rotate-90" : ""
            }`}
          />
          {channelName ? (
            <span className="truncate rounded-sm bg-accent-soft px-1.5 py-0.5 font-mono text-[13px] font-medium text-accent-fg">
              #{channelName}
            </span>
          ) : (
            <span className="truncate text-[13px] font-medium text-fg-muted">
              Entry {index + 1}
            </span>
          )}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove entry ${index + 1}`}
          onClick={onRemove}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-3 p-3">
          {subfields.map((sub) => (
            <label key={sub.key} className="flex flex-col gap-1">
              <span className="text-[13px] text-fg-muted">{sub.label}</span>
              <ConfigFieldInput
                field={{ ...sub, key: `${parentKey}.${index}.${sub.key}` }}
                value={record[sub.key]}
                onChange={(v) => onChange({ ...record, [sub.key]: v })}
                roles={roles}
                channels={channels}
                guildId={guildId}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Substitutes the known placeholders with fake member data client-side, same
 * shape as the worker's welcome renderer — unknown placeholders stay verbatim. */
export function resolveTemplatePreview(template: string): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (match, name: string) => {
    switch (name) {
      case "user":
        return "@Alex";
      case "userId":
        return "123456789012345678";
      case "username":
      case "nickname":
        return "Alex";
      case "userAvatarUrl":
        return "https://cdn.discordapp.com/embed/avatars/0.png";
      case "server":
        return "Your Server";
      case "serverId":
        return "987654321098765432";
      case "serverIconUrl":
        return "https://cdn.discordapp.com/embed/avatars/1.png";
      case "memberCount":
      case "memberNumber":
        return "128";
      default:
        return match;
    }
  });
}

/** Splits on a lone `---` line into separate text components with a drawn
 * divider between them — mirrors `splitOnSeparator` in
 * packages/core/src/lib/message-content.ts, which the worker actually
 * renders with. */
function textPreviewComponents(text: string): PreviewV2Component[] {
  const parts = text.split("\n").reduce<string[]>((acc, line) => {
    if (/^\s*---\s*$/.test(line)) {
      acc.push("");
      return acc;
    }
    if (acc.length === 0) acc.push(line);
    else acc[acc.length - 1] += (acc[acc.length - 1] ? "\n" : "") + line;
    return acc;
  }, []);
  return parts.flatMap((part, i): PreviewV2Component[] =>
    i === 0
      ? [{ kind: "text", content: part }]
      : [{ kind: "separator", divider: true }, { kind: "text", content: part }],
  );
}

// Mirrors WelcomeTemplateVars (packages/core/src/modules/welcome/lib/template.ts),
// substituted by renderTemplate in packages/core/src/lib/utilities/template.ts.
const TemplateVariableGroups = [
  {
    label: "Member",
    variables: ["user", "userId", "username", "nickname", "userAvatarUrl"],
  },
  {
    label: "Server",
    variables: ["server", "serverId", "serverIconUrl", "memberCount", "memberNumber"],
  },
] as const;

const TemplateVariables = TemplateVariableGroups.flatMap((g) => g.variables);

function insertToken(
  el: HTMLTextAreaElement | null,
  current: string,
  token: string,
  onChange: (value: unknown) => void,
) {
  // A chip click moves focus to the chip, collapsing the caret — only trust
  // the selection when the textarea itself is focused, else append.
  const focused = el !== null && document.activeElement === el;
  const start = focused ? (el?.selectionStart ?? current.length) : current.length;
  const end = focused ? (el?.selectionEnd ?? current.length) : current.length;
  const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
  onChange(next);
  if (!el) return;
  const caret = start + token.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
}

function VariableChipRow({
  variables,
  onInsert,
}: {
  variables: readonly string[];
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(`{${v}}`)}
          aria-label={`Insert {${v}}`}
          className="rounded-control border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-accent-fg transition-colors hover:border-accent"
        >
          {`{${v}}`}
        </button>
      ))}
    </div>
  );
}

/** Groups by category when `variables` is the default rich set (an
 * `enabledBy`-free lookup against `TemplateVariableGroups`); a custom
 * `field.templateVars` override has no known categories, so it renders flat. */
function VariableChips({
  variables,
  onInsert,
}: {
  variables: readonly string[];
  onInsert: (token: string) => void;
}) {
  const groups = TemplateVariableGroups.filter((g) =>
    g.variables.some((v) => variables.includes(v)),
  );
  const isDefaultSet =
    groups.reduce((n, g) => n + g.variables.length, 0) === variables.length;

  if (!isDefaultSet) {
    return (
      <div role="group" aria-label="Template variables">
        <VariableChipRow variables={variables} onInsert={onInsert} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Template variables">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">
            {g.label}
          </span>
          <VariableChipRow variables={g.variables} onInsert={onInsert} />
        </div>
      ))}
    </div>
  );
}

interface ResolvedRichPreview {
  accentColor?: string;
  footer?: string;
  imageUrls?: string[];
  buttons?: PreviewButton[];
  thumbnailUrl?: string;
}

/** Pulls the sibling values a `richPreview`-declaring template field named
 * (accent color, footer, image gallery, action buttons) out of the module's
 * full config record, so the composer can render the whole card. */
function resolveRichPreview(
  richPreview: ConfigField["richPreview"],
  config?: Record<string, unknown>,
): ResolvedRichPreview | undefined {
  if (!richPreview || !config) return undefined;
  const accentColor =
    richPreview.accentColorKey && typeof config[richPreview.accentColorKey] === "string"
      ? (config[richPreview.accentColorKey] as string)
      : undefined;
  const footer =
    richPreview.footerKey && typeof config[richPreview.footerKey] === "string"
      ? (config[richPreview.footerKey] as string)
      : undefined;
  const imageUrls =
    richPreview.imageUrlsKey && Array.isArray(config[richPreview.imageUrlsKey])
      ? (config[richPreview.imageUrlsKey] as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.length > 0,
        )
      : undefined;
  const buttonsRaw =
    richPreview.buttonsKey && Array.isArray(config[richPreview.buttonsKey])
      ? (config[richPreview.buttonsKey] as unknown[])
      : undefined;
  const buttons = buttonsRaw
    ?.map((b): PreviewButton | null => {
      if (typeof b !== "object" || b === null) return null;
      const label = (b as Record<string, unknown>).label;
      return typeof label === "string" && label.length > 0
        ? { label, style: "link" as const }
        : null;
    })
    .filter((b): b is PreviewButton => b !== null);
  const thumbnailUrl =
    richPreview.thumbnailKey && typeof config[richPreview.thumbnailKey] === "string"
      ? (config[richPreview.thumbnailKey] as string)
      : undefined;
  if (
    !accentColor &&
    !footer &&
    !imageUrls?.length &&
    !buttons?.length &&
    !thumbnailUrl
  )
    return undefined;
  return { accentColor, footer, imageUrls, buttons, thumbnailUrl };
}

function TemplateComposer({
  fieldKey,
  fieldLabel,
  variables,
  shown,
  onChange,
  richPreview,
}: {
  fieldKey: string;
  fieldLabel: string;
  variables: readonly string[];
  shown: string;
  onChange: (value: unknown) => void;
  richPreview?: ResolvedRichPreview;
}) {
  const [debounced, setDebounced] = useState(shown);
  const [expanded, setExpanded] = useState(false);
  const mainRef = useRef<HTMLTextAreaElement>(null);
  const bigRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(shown), 300);
    return () => clearTimeout(timer);
  }, [shown]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal — fall back to the plain `open` attribute so
    // component tests can still query the editor.
    if (expanded && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!expanded && dialog.open) dialog.close();
  }, [expanded]);

  const rows = Math.min(12, Math.max(5, shown.split("\n").length + Math.floor(shown.length / 90)));

  const previewContainer: PreviewContainer | undefined = richPreview
    ? {
        accentColor: richPreview.accentColor,
        thumbnailUrl: richPreview.thumbnailUrl,
        components: [
          ...textPreviewComponents(resolveTemplatePreview(debounced)),
          ...(richPreview.imageUrls?.length
            ? ([{ kind: "media", imageUrls: richPreview.imageUrls }] satisfies PreviewV2Component[])
            : []),
          ...(richPreview.footer
            ? ([{ kind: "text", content: `-# ${richPreview.footer}` }] satisfies PreviewV2Component[])
            : []),
          ...(richPreview.buttons?.length
            ? ([{ kind: "buttons", buttons: richPreview.buttons }] satisfies PreviewV2Component[])
            : []),
        ],
      }
    : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-start gap-1.5">
        <Textarea
          ref={mainRef}
          id={fieldKey}
          aria-label={fieldLabel}
          rows={rows}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Expand ${fieldLabel} editor`}
          onClick={() => setExpanded(true)}
        >
          <Expand aria-hidden />
          Expand
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <VariableChips variables={variables} onInsert={(token) => insertToken(mainRef.current, shown, token, onChange)} />
        {richPreview ? (
          <button
            type="button"
            onClick={() => insertToken(mainRef.current, shown, "\n---\n", onChange)}
            aria-label="Insert divider"
            className="rounded-control border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-accent-fg transition-colors hover:border-accent"
          >
            ---
          </button>
        ) : null}
      </div>
      <DiscordMessagePreview
        channelName="preview"
        body={previewContainer ? undefined : resolveTemplatePreview(debounced)}
        container={previewContainer}
      />
      <dialog
        ref={dialogRef}
        aria-label={`${fieldLabel} editor`}
        onClose={() => setExpanded(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setExpanded(false);
        }}
        className="m-auto max-h-[calc(100dvh-3rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-panel border border-border bg-surface p-0 text-fg shadow-e3 backdrop:bg-overlay"
      >
        {/* Mounted only while open: a closed dialog still sits in the DOM and
          would double every label/preview query (and reader). */}
        {expanded ? (
          <>
            <div className="flex flex-col gap-3 px-4 py-4">
              <h2 className="font-display text-[17px] leading-5 font-semibold tracking-[0.01em]">
                {fieldLabel}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <VariableChips variables={variables} onInsert={(token) => insertToken(bigRef.current, shown, token, onChange)} />
                {richPreview ? (
                  <button
                    type="button"
                    onClick={() => insertToken(bigRef.current, shown, "\n---\n", onChange)}
                    aria-label="Insert divider"
                    className="rounded-control border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-accent-fg transition-colors hover:border-accent"
                  >
                    ---
                  </button>
                ) : null}
              </div>
              <Textarea
                ref={bigRef}
                rows={14}
                aria-label={fieldLabel}
                value={shown}
                onChange={(e) => onChange(e.target.value)}
              />
              <DiscordMessagePreview
                channelName="preview"
                body={previewContainer ? undefined : resolveTemplatePreview(debounced)}
                container={previewContainer}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-4 py-3">
              <Button type="button" variant="primary" onClick={() => setExpanded(false)} autoFocus>
                Done
              </Button>
            </div>
          </>
        ) : null}
      </dialog>
    </div>
  );
}

function ColorPicker({
  fieldKey,
  fieldLabel,
  shown,
  fallback,
  onChange,
}: {
  fieldKey: string;
  fieldLabel: string;
  shown: string;
  fallback: string;
  onChange: (value: unknown) => void;
}) {
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(shown) ? shown : fallback;
  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="color"
        aria-label={`${fieldLabel} color`}
        value={pickerValue}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-control border border-border bg-bg-subtle p-0.5"
      />
      <Input
        id={fieldKey}
        type="text"
        aria-label={`${fieldLabel} hex value`}
        placeholder={fallback}
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-36 font-mono text-[14px] tabular"
      />
    </div>
  );
}

function ImageUrlInput({
  fieldKey,
  fieldLabel,
  shown,
  onChange,
}: {
  fieldKey: string;
  fieldLabel: string;
  shown: string;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-bg-subtle"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL
          <img
            src={shown}
            alt=""
            className="size-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <Input
        id={fieldKey}
        type="text"
        aria-label={`${fieldLabel} URL`}
        placeholder="https://…"
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-[14px]"
      />
    </div>
  );
}

function MultiTextPicker({
  fieldKey,
  fieldLabel,
  selected,
  onChange,
}: {
  fieldKey: string;
  fieldLabel: string;
  selected: string[];
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState("");
  const entryId = `${fieldKey}-text-entry`;

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setDraft("");
  }

  function removeEntry(entry: string) {
    onChange(selected.filter((item) => item !== entry));
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {selected.length > 0 ? (
        <ul className="flex w-full flex-col gap-1">
          {selected.map((entry) => (
            <li key={entry} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[14px]">{entry}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${entry}`}
                onClick={() => removeEntry(entry)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-1.5">
        <Input
          id={entryId}
          type="text"
          placeholder="Add entry…"
          aria-label={`Add entry to ${fieldLabel}`}
          className="text-[13px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={commitDraft}
          disabled={draft.trim() === ""}
        >
          Add
        </Button>
      </div>
      <p aria-live="polite" className="text-[13px] leading-4 text-fg-subtle">
        {selected.length === 0
          ? "Empty list"
          : `${selected.length} ${selected.length === 1 ? "entry" : "entries"}`}
      </p>
    </div>
  );
}
