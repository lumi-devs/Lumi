"use client";

import { useState } from "react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { setManyGuildConfigFields } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Field, Label } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { DashboardChannelView, DashboardRoleView } from "#/lib/dashboard-data";

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
  const baseline = Object.fromEntries(editableKeys.map((k) => [k, config[k]]));
  const [form, setForm] = useState<Record<string, unknown>>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    const changed = Object.fromEntries(
      editableKeys
        .filter((k) => JSON.stringify(form[k]) !== JSON.stringify(baseline[k]))
        .map((k) => [k, form[k]]),
    );
    run(async () => {
      const res = await setManyGuildConfigFields(guildId, moduleName, changed);
      if (!res.ok) setError(res.error ?? "Save failed");
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
          const toggles = group.fields.filter((f) => f.type === FieldType.Boolean);
          const inputs = group.fields.filter((f) => f.type !== FieldType.Boolean);
          return (
            <div
              key={group.name}
              className={index === 0 ? undefined : "border-t border-border"}
            >
              {showHeadings ? (
                <h4 className="font-display border-b border-border bg-bg-subtle px-4 py-1.5 text-[13px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
                  {group.name}
                </h4>
              ) : null}
              {toggles.length > 0 ? (
                <CardBody className="grid grid-cols-1 gap-3 bg-bg-subtle sm:grid-cols-2">
                  {toggles.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Label htmlFor={field.key} className="block text-[14.5px]">
                          {field.label}
                        </Label>
                        {field.description ? (
                          <p className="mt-0.5 text-[13px] leading-4 text-fg-subtle">
                            {field.description}
                          </p>
                        ) : null}
                      </div>
                      <ConfigFieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(value) => set(field.key, value)}
                        roles={roles}
                        channels={channels}
                      />
                    </div>
                  ))}
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
                        field.type === FieldType.Enum ||
                        field.type === FieldType.MultiChannel ||
                        field.type === FieldType.MultiRole
                          ? "sm:col-span-3"
                          : undefined
                      }
                    >
                      <ConfigFieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(value) => set(field.key, value)}
                        roles={roles}
                        channels={channels}
                      />
                    </Field>
                  ))}
                </CardBody>
              ) : null}
            </div>
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
