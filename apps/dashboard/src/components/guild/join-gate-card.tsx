"use client";

import { useState } from "react";
import { setGuildConfigField } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Input, Select, Field } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";

const EDITABLE_KEYS = [
  "joingate_enabled",
  "verification_enabled",
  "min_account_age_hours",
  "raid_join_count",
  "raid_window_seconds",
  "raid_action",
] as const;

export function JoinGateCard({
  guildId,
  config,
}: {
  guildId: string;
  config: Record<string, unknown>;
}) {
  const baseline = Object.fromEntries(EDITABLE_KEYS.map((k) => [k, config[k]]));
  const [form, setForm] = useState<Record<string, unknown>>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
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
        <CardHeader>
          <CardTitle>Join gate &amp; verification</CardTitle>
          <CardDescription>
            Screen new members for raids and throwaway accounts, and require the
            verification panel before granting access.
          </CardDescription>
        </CardHeader>

        <CardBody className="grid grid-cols-1 gap-3 border-t border-border bg-bg-subtle sm:grid-cols-2">
          <SettingToggle
            label="Join gate"
            checked={Boolean(form.joingate_enabled)}
            onChange={(v) => set("joingate_enabled", v)}
          />
          <SettingToggle
            label="Verification"
            checked={Boolean(form.verification_enabled)}
            onChange={(v) => set("verification_enabled", v)}
          />
        </CardBody>

        <CardBody className="grid grid-cols-1 gap-4 border-t border-border sm:grid-cols-3">
          <Field label="Min account age (h)" htmlFor="min_account_age_hours">
            <Input
              id="min_account_age_hours"
              type="number"
              className="tabular"
              value={String(form.min_account_age_hours ?? "")}
              onChange={(e) => set("min_account_age_hours", Number(e.target.value))}
            />
          </Field>
          <Field label="Raid join count" htmlFor="raid_join_count">
            <Input
              id="raid_join_count"
              type="number"
              className="tabular"
              value={String(form.raid_join_count ?? "")}
              onChange={(e) => set("raid_join_count", Number(e.target.value))}
            />
          </Field>
          <Field label="Raid window (s)" htmlFor="raid_window_seconds">
            <Input
              id="raid_window_seconds"
              type="number"
              className="tabular"
              value={String(form.raid_window_seconds ?? "")}
              onChange={(e) => set("raid_window_seconds", Number(e.target.value))}
            />
          </Field>
          <Field label="Gate action" htmlFor="raid_action" className="sm:col-span-3">
            <Select
              id="raid_action"
              value={String(form.raid_action ?? "kick")}
              onChange={(e) => set("raid_action", e.target.value)}
            >
              <option value="kick">Kick</option>
              <option value="timeout">Timeout</option>
              <option value="quarantine">Quarantine</option>
            </Select>
          </Field>
        </CardBody>
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

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2.5">
      <span className="text-[14.5px] font-medium text-fg">{label}</span>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}
