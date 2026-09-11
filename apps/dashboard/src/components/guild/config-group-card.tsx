"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { setManyGuildConfigFields } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { ConfigFieldInput, isWideField } from "#/components/guild/config-field-input";
import { ChannelPicker } from "#/components/guild/channel-picker";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { CollapsibleSection } from "#/components/ui/collapsible-section";
import { Field, HintTooltip, Label, SettingRow } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { DashboardChannelView, DashboardRoleView } from "#/lib/dashboard-data";

/**
 * A per-toggle channel override. Most toggles inherit their section's
 * channel, so this stays a compact button (via `ChannelPicker`) until opened
 * rather than a live dropdown on every row.
 */
function PairedChannel({
  field,
  value,
  onChange,
  channels,
  guildId,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  channels: DashboardChannelView[];
  guildId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={field.key}
        className="shrink-0 text-[13px] font-medium text-fg-muted"
      >
        Channel
      </Label>
      <div className="min-w-0 flex-1">
        <ChannelPicker
          field={field}
          value={value}
          onChange={onChange}
          channels={channels}
          guildId={guildId}
        />
      </div>
      {field.description ? (
        <HintTooltip hint={field.description} name={`About ${field.label}`} />
      ) : null}
    </div>
  );
}

/** Indented, left-accented container for a toggle's dependent controls — the
 * channel it fires into (`pairedWith`) or any field gated by it via
 * `enabledBy`. Nests config that only does something while the toggle above
 * it is on, instead of letting it drift into the flat field list. */
function DependentFields({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-4 flex flex-col gap-3 border-l-2 border-l-accent-soft bg-bg-subtle/60 py-3 pl-4">
      {children}
    </div>
  );
}

/**
 * A quick way to point every per-event channel override in a group at the
 * same channel in one shot, instead of opening each `PairedChannel` picker
 * individually — the gap Sapphire's dashboard closes with a "set channel for
 * all types" action on its logging page.
 */
function BulkChannelApply({
  fields,
  channels,
  guildId,
  onApply,
}: {
  fields: ConfigField[];
  channels: DashboardChannelView[];
  guildId: string;
  onApply: (channelId: unknown) => void;
}) {
  const [value, setValue] = useState<unknown>(null);
  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg-subtle px-4 py-2.5">
      <Wand2 aria-hidden className="size-4 shrink-0 text-fg-subtle" />
      <span className="shrink-0 text-[13px] font-medium text-fg-muted">
        Set all {fields.length} channels to
      </span>
      <div className="min-w-0 max-w-[16rem] flex-1">
        <ChannelPicker
          field={fields[0]!}
          value={value}
          onChange={setValue}
          channels={channels}
          guildId={guildId}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={value === null}
        onClick={() => onApply(value)}
      >
        Apply to all
      </Button>
    </div>
  );
}

/** A field with no `enabledBy` is always visible; otherwise it only shows
 * once its governing toggle is on in the live (unsaved) form state — hiding
 * config that doesn't do anything yet instead of dumping it on screen. */
function isFieldVisible(field: ConfigField, form: Record<string, unknown>): boolean {
  return field.enabledBy === undefined || Boolean(form[field.enabledBy]);
}

function groupsFor(
  configFields: ConfigField[],
  names: string[],
): { name: string; fields: ConfigField[] }[] {
  return names.flatMap((name) => {
    const fields = configFields.filter((f) => f.group === name);
    return fields.length > 0 ? [{ name, fields }] : [];
  });
}

/**
 * Renders the named schema groups of one module as an editable card. Only the
 * group names are chosen by the caller — keys, labels, descriptions, widgets
 * and ordering all come from the module's own schema, so a field added in core
 * shows up here without a dashboard change.
 */
export function ConfigGroupCard({
  guildId,
  moduleName,
  title,
  description,
  groups: groupNames,
  config,
  configFields,
  roles = [],
  channels = [],
}: {
  guildId: string;
  moduleName: string;
  title: string;
  description?: string;
  /** Schema group names to render, in this order. Empty groups are skipped. */
  groups: string[];
  config: Record<string, unknown>;
  configFields: ConfigField[];
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
}) {
  const groups = groupsFor(configFields, groupNames);
  const editableKeys = groups.flatMap((g) => g.fields.map((f) => f.key));
  const propBaseline = Object.fromEntries(editableKeys.map((k) => [k, config[k]]));

  // Section tabs swap one card for another in the same position, so React keeps
  // this component mounted and `useState` would carry the previous section's
  // values over — which then read as unsaved changes the user never made.
  const editing = `${moduleName}:${editableKeys.join(",")}`;
  const [form, setForm] = useState<Record<string, unknown>>(propBaseline);
  // Tracked as state (not derived straight from `config`) so a successful save
  // can mark itself as the new baseline immediately — waiting on the server
  // action's revalidation to flow back through props left the save bar reading
  // "unsaved changes" for a beat (or longer) after the save had already landed.
  const [baseline, setBaseline] = useState<Record<string, unknown>>(propBaseline);
  const [editingNow, setEditingNow] = useState(editing);
  if (editingNow !== editing) {
    setEditingNow(editing);
    setForm(propBaseline);
    setBaseline(propBaseline);
  }

  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setMany(keys: string[], value: unknown) {
    setForm((f) => {
      const next = { ...f };
      for (const key of keys) next[key] = value;
      return next;
    });
  }

  function handleSave() {
    const changed = Object.fromEntries(
      editableKeys
        .filter((k) => JSON.stringify(form[k]) !== JSON.stringify(baseline[k]))
        .map((k) => [k, form[k]]),
    );
    run(async () => {
      const res = await setManyGuildConfigFields(guildId, moduleName, changed);
      if (!res.ok) {
        setError(res.error ?? "Save failed");
        return;
      }
      setBaseline(form);
    });
  }

  if (groups.length === 0) return null;

  // A single group already has the card title above it; a second heading
  // repeating it reads as an empty row.
  const showHeadings = groups.length > 1;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>

        {groups.map((group, index) => {
          const candidateToggles = group.fields.filter(
            (f) => f.type === FieldType.Boolean && isFieldVisible(f, form),
          );
          // A boolean field gated by another toggle in this group is a nested
          // dependent, not its own top-level row — otherwise it renders twice.
          const nestedToggleKeys = new Set(
            candidateToggles
              .filter((f) => candidateToggles.some((t) => t.key === f.enabledBy))
              .map((f) => f.key),
          );
          const toggles = candidateToggles.filter((f) => !nestedToggleKeys.has(f.key));
          const overrides = new Map(
            toggles.flatMap((toggle) => {
              const override = toggle.pairedWith
                ? group.fields.find((f) => f.key === toggle.pairedWith)
                : undefined;
              return override ? [[toggle.key, override] as const] : [];
            }),
          );
          const paired = new Set([...overrides.values()].map((f) => f.key));
          // Any field gated by a toggle in this group nests under that toggle
          // instead of the flat field list, once the toggle is on.
          const dependents = new Map<string, ConfigField[]>(
            toggles.flatMap((toggle) => {
              const deps = group.fields.filter(
                (f) =>
                  f.key !== toggle.key &&
                  f.enabledBy === toggle.key &&
                  !paired.has(f.key) &&
                  isFieldVisible(f, form),
              );
              return deps.length > 0 ? [[toggle.key, deps] as const] : [];
            }),
          );
          const dependentKeys = new Set(
            [...dependents.values()].flat().map((f) => f.key),
          );
          const inputs = group.fields.filter(
            (f) =>
              f.type !== FieldType.Boolean &&
              !paired.has(f.key) &&
              !dependentKeys.has(f.key) &&
              isFieldVisible(f, form),
          );
          if (toggles.length === 0 && inputs.length === 0) return null;
          const overrideFields = [...overrides.values()];
          const body = (
            <>
              {overrideFields.length > 1 ? (
                <BulkChannelApply
                  fields={overrideFields}
                  channels={channels}
                  guildId={guildId}
                  onApply={(channelId) => setMany(overrideFields.map((f) => f.key), channelId)}
                />
              ) : null}
              {toggles.length > 0 ? (
                <CardBody className="flex flex-col gap-3">
                  {toggles.map((field) => {
                    const override = overrides.get(field.key);
                    const deps = dependents.get(field.key);
                    return (
                      <div key={field.key}>
                        <SettingRow
                          label={field.label}
                          htmlFor={field.key}
                          description={field.description}
                          className="rounded-panel border border-border bg-surface transition-colors duration-fast hover:border-border-strong"
                          control={
                            <ConfigFieldInput
                              field={field}
                              value={form[field.key]}
                              onChange={(value) => set(field.key, value)}
                              config={form}
                              roles={roles}
                              channels={channels}
                              guildId={guildId}
                            />
                          }
                        />
                        {override || deps ? (
                          <DependentFields>
                            {override ? (
                              <PairedChannel
                                field={override}
                                value={form[override.key]}
                                onChange={(value) => set(override.key, value)}
                                channels={channels}
                                guildId={guildId}
                              />
                            ) : null}
                            {deps?.map((dep) => (
                              <Field
                                key={dep.key}
                                label={dep.label}
                                htmlFor={dep.key}
                                hint={dep.description}
                              >
                                <ConfigFieldInput
                                  field={dep}
                                  value={form[dep.key]}
                                  onChange={(value) => set(dep.key, value)}
                                  config={form}
                                  roles={roles}
                                  channels={channels}
                                  guildId={guildId}
                                />
                              </Field>
                            ))}
                          </DependentFields>
                        ) : null}
                      </div>
                    );
                  })}
                </CardBody>
              ) : null}
              {inputs.length > 0 ? (
                <CardBody
                  className={
                    toggles.length > 0
                      ? "grid grid-cols-1 gap-4 border-t border-border sm:grid-cols-3"
                      : "grid grid-cols-1 gap-4 sm:grid-cols-3"
                  }
                >
                  {inputs.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      htmlFor={field.key}
                      hint={field.description}
                      className={
                        field.type === FieldType.Enum || isWideField(field)
                          ? "sm:col-span-3"
                          : undefined
                      }
                    >
                      <ConfigFieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(value) => set(field.key, value)}
                        config={form}
                        roles={roles}
                        channels={channels}
                        guildId={guildId}
                      />
                    </Field>
                  ))}
                </CardBody>
              ) : null}
            </>
          );

          if (!showHeadings) return <div key={group.name}>{body}</div>;

          return (
            <CollapsibleSection
              key={group.name}
              title={group.name}
              count={toggles.length + inputs.length}
              countLabel="setting"
              defaultOpen={index === 0}
            >
              {body}
            </CollapsibleSection>
          );
        })}
      </Card>
      <SaveBar
        dirty={dirty}
        saving={isPending}
        error={error}
        onSave={handleSave}
        onReset={() => setForm(baseline)}
      />
    </>
  );
}
