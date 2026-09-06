"use client";

import { useState } from "react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { Button } from "#/components/ui/button";
import { Input, Select } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { resolveConfigValue } from "#/lib/config-labels";
import type { DashboardRoleView, DashboardChannelView } from "#/lib/dashboard-data";

// Matches the Discord panel fallback (`resolveChannelTypes` in
// `packages/core/src/modules/core/ui/modules.ts`): text channels unless the
// field declares `channelTypes`, which always wins.
const DefaultPickableChannelTypes = new Set([0]);
const SliderFallbackMax = 100;

function channelOptionsFor(
  field: ConfigField,
  channels: DashboardChannelView[],
): DashboardChannelView[] {
  const allow = field.channelTypes;
  return channels.filter((c) =>
    allow && allow.length > 0
      ? allow.includes(c.type)
      : DefaultPickableChannelTypes.has(c.type),
  );
}

export function ConfigFieldInput({
  field,
  value,
  onChange,
  roles = [],
  channels = [],
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
}) {
  switch (field.type) {
    case FieldType.BOOLEAN:
      return (
        <Switch
          id={field.key}
          checked={Boolean(value)}
          onChange={onChange}
          aria-label={field.label}
        />
      );

    case FieldType.ENUM:
      return (
        <Select
          id={field.key}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      );

    case FieldType.NUMBER: {
      if (field.step !== undefined) {
        const numeric = Number(value);
        const shown = Number.isFinite(numeric) ? numeric : 0;
        return (
          <div className="flex w-full items-center gap-2">
            <Input
              id={field.key}
              type="range"
              min={0}
              max={Math.max(SliderFallbackMax, shown)}
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
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );
    }

    case FieldType.DURATION: {
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

    case FieldType.MULTI_ROLE: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <MultiIdPicker
          fieldKey={field.key}
          fieldLabel={field.label}
          selected={selected}
          options={roles.map((r) => ({ id: r.id, name: `@${r.name}` }))}
          summary={resolveConfigValue(FieldType.MULTI_ROLE, selected, roles, channels)}
          onChange={onChange}
        />
      );
    }

    case FieldType.MULTI_CHANNEL: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const options = channelOptionsFor(field, channels);
      return (
        <MultiIdPicker
          fieldKey={field.key}
          fieldLabel={field.label}
          selected={selected}
          options={options.map((c) => ({ id: c.id, name: `#${c.name}` }))}
          summary={resolveConfigValue(FieldType.MULTI_CHANNEL, selected, roles, channels)}
          onChange={onChange}
        />
      );
    }

    case FieldType.MULTI_USER: {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <MultiIdPicker
          fieldKey={field.key}
          fieldLabel={field.label}
          selected={selected}
          options={[]}
          summary={resolveConfigValue(FieldType.MULTI_USER, selected, roles, channels)}
          onChange={onChange}
        />
      );
    }

    case FieldType.STRING_LIST: {
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

    case FieldType.ROLE: {
      const shown = typeof value === "string" ? value : "";
      return (
        <Select
          id={field.key}
          aria-label={field.label}
          value={shown}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">None</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      );
    }

    case FieldType.CHANNEL: {
      const shown = typeof value === "string" ? value : "";
      const options = channelOptionsFor(field, channels);
      return (
        <Select
          id={field.key}
          aria-label={field.label}
          value={shown}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">None</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </Select>
      );
    }

    default: {
      const placeholder =
        field.type === FieldType.USER ? "User ID" : "";
      const shown = typeof value === "string" ? value : "";
      const isSnowflake = field.type === FieldType.USER;
      return (
        <Input
          id={field.key}
          type="text"
          placeholder={placeholder}
          className={isSnowflake ? "font-mono text-[14px]" : undefined}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }
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

function MultiIdPicker({
  fieldKey,
  fieldLabel,
  selected,
  options,
  summary,
  onChange,
}: {
  fieldKey: string;
  fieldLabel: string;
  selected: string[];
  options: { id: string; name: string }[];
  summary: string;
  onChange: (value: unknown) => void;
}) {
  const [draftId, setDraftId] = useState("");
  const entryId = `${fieldKey}-id-entry`;

  function commitDraft() {
    const trimmed = draftId.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setDraftId("");
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Select
        id={fieldKey}
        aria-label={fieldLabel}
        multiple
        value={selected}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions, (o) => o.value))
        }
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-1.5">
        <Input
          id={entryId}
          type="text"
          inputMode="numeric"
          placeholder="Add ID…"
          aria-label={`Add ID to ${fieldLabel}`}
          className="font-mono text-[13px]"
          value={draftId}
          onChange={(e) => setDraftId(e.target.value)}
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
          disabled={draftId.trim() === ""}
        >
          Add
        </Button>
      </div>
      <p aria-live="polite" className="text-[13px] leading-4 text-fg-subtle">
        {summary}
      </p>
    </div>
  );
}
