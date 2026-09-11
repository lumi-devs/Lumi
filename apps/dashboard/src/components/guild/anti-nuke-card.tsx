"use client";

import { useState } from "react";
import type { ConfigField } from "@lumi/contracts";
import {
  setGuildConfigField,
  setManyGuildConfigFields,
} from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Field, Label } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { useServerAction } from "#/lib/use-server-action";
import type {
  DashboardChannelView,
  DashboardRoleView,
} from "#/lib/dashboard-data";

const SecurityModuleName = "security";
const EnabledKey = "antinuke_enabled";

const LimitsGroup = "Nuke Limits";
const SettingsGroup = "Anti-Nuke";

interface NukeRow {
  limit: ConfigField;
  response: ConfigField | null;
  label: string;
}

function responseKeyFor(limitKey: string): string {
  return `response_${limitKey.replace(/^max_/, "")}`;
}

/** Rows derive from the schema's `max_*` limit fields; a `response_*`
 * counterpart is picked up when the schema carries one, otherwise the row
 * is limit-only and the worker default applies. */
function nukeRowsFor(configFields: ConfigField[]): NukeRow[] {
  const byKey = new Map(configFields.map((f) => [f.key, f]));
  return configFields
    .filter((f) => f.group === LimitsGroup && f.key.startsWith("max_"))
    .map((limit) => ({
      limit,
      response: byKey.get(responseKeyFor(limit.key)) ?? null,
      label: limit.label.replace(/^Max /, ""),
    }));
}

/** Everything in the anti-nuke group except the master toggle, which the card
 * header owns. Derived so a setting added to the group in core shows up here. */
function extrasFor(configFields: ConfigField[]): ConfigField[] {
  return configFields.filter(
    (f) => f.group === SettingsGroup && f.key !== EnabledKey,
  );
}

export function AntiNukeCard({
  guildId,
  config,
  configFields,
  roles = [],
  channels = [],
  missingAuditLogPermission,
}: {
  guildId: string;
  config: Record<string, unknown>;
  configFields: ConfigField[];
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
  /** True when the bot can't read the audit log, so anti-nuke can't see anything to respond to. */
  missingAuditLogPermission?: boolean;
}) {
  const rows = nukeRowsFor(configFields);
  const extras = extrasFor(configFields);
  const editableKeys = [
    ...rows.flatMap((r) => (r.response ? [r.limit.key, r.response.key] : [r.limit.key])),
    ...extras.map((f) => f.key),
  ];
  const baseline = Object.fromEntries(editableKeys.map((k) => [k, config[k]]));
  const [form, setForm] = useState<Record<string, unknown>>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const enabled = Boolean(config[EnabledKey]);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleToggleEnabled(next: boolean) {
    run(async () => {
      const res = await setGuildConfigField(
        guildId,
        SecurityModuleName,
        EnabledKey,
        next,
      );
      if (!res.ok) setError(res.error ?? "Failed to toggle");
    });
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
        <CardHeader
          actions={
            <Switch
              checked={enabled}
              onChange={handleToggleEnabled}
              disabled={isPending}
              aria-label="Toggle anti-nuke"
            />
          }
        >
          <CardTitle>Anti-nuke</CardTitle>
          <CardDescription>
            Watches Discord&rsquo;s audit log for mass bans, kicks, and channel/role
            deletions, and reacts per action type below.
          </CardDescription>
        </CardHeader>

        {missingAuditLogPermission ? (
          <CardBody className="border-t border-border bg-warning-soft">
            <p className="text-[14px] leading-5 text-warning-fg">
              Lumi is missing the <code className="font-mono">View Audit Log</code>{" "}
              permission — anti-nuke can&rsquo;t see mass bans or deletions without it.
            </p>
          </CardBody>
        ) : null}

        {extras.length > 0 ? (
          <CardBody
            className="grid grid-cols-1 gap-4 border-t border-border sm:grid-cols-3 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!enabled}
          >
            {extras.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={field.key}
                hint={field.description}
              >
                <ConfigFieldInput
                  field={field}
                  value={form[field.key]}
                  onChange={(value) => set(field.key, value)}
                  roles={roles}
                  channels={channels}
                  guildId={guildId}
                />
              </Field>
            ))}
          </CardBody>
        ) : null}

        <div
          className="divide-y divide-border border-t border-border aria-disabled:pointer-events-none aria-disabled:opacity-50"
          aria-disabled={!enabled}
        >
          <div className="grid grid-cols-[1fr_7rem_10rem] gap-3 px-4 py-2 font-mono text-[11.5px] tracking-wide text-fg-subtle uppercase">
            <span>Action</span>
            <span>Limit</span>
            <span>Response</span>
          </div>
          {rows.map((row) => {
            const response = row.response;
            return (
              <div
                key={row.limit.key}
                className="grid grid-cols-[1fr_7rem_10rem] items-center gap-3 px-4 py-3"
              >
                <Label htmlFor={row.limit.key} className="text-[14.5px] font-normal text-fg">
                  {row.label}
                </Label>
                <ConfigFieldInput
                  field={row.limit}
                  value={form[row.limit.key]}
                  onChange={(value) => set(row.limit.key, value)}
                  roles={roles}
                  channels={channels}
                  guildId={guildId}
                />
                {response ? (
                  <ConfigFieldInput
                    field={response}
                    value={form[response.key]}
                    onChange={(value) => set(response.key, value)}
                    roles={roles}
                    channels={channels}
                    guildId={guildId}
                  />
                ) : (
                  <span className="text-[14px] text-fg-subtle" title="No per-kind response in the schema — the worker default applies.">
                    —
                  </span>
                )}
              </div>
            );
          })}
        </div>
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
