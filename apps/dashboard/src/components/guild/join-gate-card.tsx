"use client";

import { useState } from "react";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { setManyGuildConfigFields } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Field, Label } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { DashboardRoleView } from "#/lib/dashboard-data";

const SecurityModuleName = "security";

/** Schema groups this card owns, in render order. Everything else about
 * the fields — keys, labels, descriptions, widgets — comes from the schema. */
const JoinGateGroups = ["Join Gate", "Join Gate Filters", "Verification"];

function groupsFor(configFields: ConfigField[]): { name: string; fields: ConfigField[] }[] {
  return JoinGateGroups.flatMap((name) => {
    const fields = configFields.filter((f) => f.group === name);
    return fields.length > 0 ? [{ name, fields }] : [];
  });
}

export function JoinGateCard({
  guildId,
  config,
  configFields,
  roles = [],
}: {
  guildId: string;
  config: Record<string, unknown>;
  configFields: ConfigField[];
  roles?: DashboardRoleView[];
}) {
  const groups = groupsFor(configFields);
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
      const res = await setManyGuildConfigFields(
        guildId,
        SecurityModuleName,
        changed,
      );
      if (!res.ok) setError(res.error ?? "Save failed");
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Join gate &amp; verification</CardTitle>
          <CardDescription>
            Screen new members for raids and throwaway accounts, and require the
            verification panel before granting access.
          </CardDescription>
        </CardHeader>

        {groups.map((group, index) => {
          const toggles = group.fields.filter((f) => f.type === FieldType.Boolean);
          const inputs = group.fields.filter((f) => f.type !== FieldType.Boolean);
          return (
            <div key={group.name} className={index === 0 ? undefined : "border-t border-border"}>
              <h4 className="border-b border-border bg-bg-subtle px-4 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.09em] text-fg-subtle">
                {group.name}
              </h4>
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
                      />
                    </div>
                  ))}
                </CardBody>
              ) : null}
              {inputs.length > 0 ? (
                <CardBody className="grid grid-cols-1 gap-4 border-t border-border sm:grid-cols-3">
                  {inputs.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      htmlFor={field.key}
                      hint={field.description}
                      className={field.type === FieldType.Enum ? "sm:col-span-3" : undefined}
                    >
                      <ConfigFieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(value) => set(field.key, value)}
                        roles={roles}
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
