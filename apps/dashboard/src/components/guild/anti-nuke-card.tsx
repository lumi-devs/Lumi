"use client";

import { useState } from "react";
import { setGuildConfigField } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Select, Input, Field } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { useServerAction } from "#/lib/use-server-action";
import { cn } from "#/lib/utils";

type NukeResponse = "log" | "quarantine" | "ban";

const RESPONSE_TONE: Record<NukeResponse, string> = {
  log: "text-fg-muted",
  quarantine: "text-warning-fg",
  ban: "text-danger-fg",
};

// One row per action kind the anti-nuke table exposes a dedicated response
// for. Matches `KIND_RESPONSE_KEYS` in `SecurityUtility.ts` — the 3 kinds
// without a per-action field there (vanity change, dangerous permission
// grant, quarantine bypass) aren't editable here yet.
const ROWS = [
  { kind: "bans", label: "Bans", limitKey: "max_bans", responseKey: "response_bans" },
  { kind: "kicks", label: "Kicks", limitKey: "max_kicks", responseKey: "response_kicks" },
  {
    kind: "channel_deletes",
    label: "Channel deletes",
    limitKey: "max_channel_deletes",
    responseKey: "response_channel_deletes",
  },
  {
    kind: "role_deletes",
    label: "Role deletes",
    limitKey: "max_role_deletes",
    responseKey: "response_role_deletes",
  },
  {
    kind: "webhook_creates",
    label: "Webhook creates",
    limitKey: "max_webhook_creates",
    responseKey: "response_webhook_creates",
  },
] as const;

const EXTRA_FIELDS = ["window_seconds", "trusted_role_ids"] as const;

export function AntiNukeCard({
  guildId,
  config,
  missingAuditLogPermission,
}: {
  guildId: string;
  config: Record<string, unknown>;
  /** True when the bot can't read the audit log, so anti-nuke can't see anything to respond to. */
  missingAuditLogPermission?: boolean;
}) {
  const editableKeys = [
    ...ROWS.flatMap((r) => [r.limitKey, r.responseKey]),
    ...EXTRA_FIELDS,
  ];
  const baseline = Object.fromEntries(editableKeys.map((k) => [k, config[k]]));
  const [form, setForm] = useState<Record<string, unknown>>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const enabled = Boolean(config["antinuke_enabled"]);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleToggleEnabled(next: boolean) {
    run(async () => {
      const res = await setGuildConfigField(guildId, "security", "antinuke_enabled", next);
      if (!res.ok) setError(res.error ?? "Failed to toggle");
    });
  }

  function handleSave() {
    const changedKeys = Object.keys(form).filter(
      (k) => JSON.stringify(form[k]) !== JSON.stringify(baseline[k]),
    );
    run(async () => {
      const results = await Promise.all(
        changedKeys.map((key) => setGuildConfigField(guildId, "security", key, form[key])),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) setError(failed.error ?? "Save failed");
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

        <CardBody className="border-t border-border">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Detection window (s)" htmlFor="window_seconds">
              <Input
                id="window_seconds"
                type="number"
                className="tabular"
                value={String(form.window_seconds ?? "")}
                onChange={(e) => set("window_seconds", Number(e.target.value))}
              />
            </Field>
            <Field
              label="Trusted roles"
              htmlFor="trusted_role_ids"
              hint="Comma-separated role IDs, exempt from anti-nuke."
              className="col-span-2 sm:col-span-1"
            >
              <Input
                id="trusted_role_ids"
                value={String(form.trusted_role_ids ?? "")}
                onChange={(e) => set("trusted_role_ids", e.target.value)}
              />
            </Field>
          </div>
        </CardBody>

        <div className="divide-y divide-border border-t border-border">
          <div className="grid grid-cols-[1fr_7rem_10rem] gap-3 px-4 py-2 font-mono text-[11.5px] tracking-wide text-fg-subtle uppercase">
            <span>Action</span>
            <span>Limit</span>
            <span>Response</span>
          </div>
          {ROWS.map((row) => {
            const response = (form[row.responseKey] as NukeResponse) ?? "quarantine";
            return (
              <div
                key={row.kind}
                className="grid grid-cols-[1fr_7rem_10rem] items-center gap-3 px-4 py-3"
              >
                <span className="text-[14.5px] text-fg">{row.label}</span>
                <Input
                  type="number"
                  className="tabular h-8"
                  aria-label={`${row.label} limit`}
                  value={String(form[row.limitKey] ?? "")}
                  onChange={(e) => set(row.limitKey, Number(e.target.value))}
                />
                <Select
                  aria-label={`${row.label} response`}
                  value={response}
                  onChange={(e) => set(row.responseKey, e.target.value)}
                  className={cn(RESPONSE_TONE[response])}
                >
                  <option value="log">Log only</option>
                  <option value="quarantine">Quarantine</option>
                  <option value="ban">Ban</option>
                </Select>
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
