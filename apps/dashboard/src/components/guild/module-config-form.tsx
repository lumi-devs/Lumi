"use client";

import { useState, useTransition } from "react";
import { setGuildConfigField, toggleGuildModule } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Badge } from "#/components/ui/badge";
import { ConfigFieldInput, ConfigFieldLabel } from "./config-field-input";
import type { DashboardModuleView } from "#/lib/dashboard-data";

/** dashboard.md §9B `DynamicConfigFormEditor` — one module's toggle + config fields. */
export function ModuleConfigForm({
  guildId,
  module: m,
}: {
  guildId: string;
  module: DashboardModuleView;
}) {
  const isCore = m.name === "core";
  const [enabled, setEnabled] = useState(m.enabled);
  const [config, setConfig] = useState<Record<string, unknown>>(m.config);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(config) !== JSON.stringify(m.config);

  function handleToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleGuildModule(guildId, m.name, next);
      if (!res.ok) {
        setEnabled(prev);
        setError(res.error ?? "Failed to toggle");
      }
    });
  }

  function handleSave() {
    setError(null);
    const changedKeys = Object.keys(config).filter(
      (k) => JSON.stringify(config[k]) !== JSON.stringify(m.config[k]),
    );
    startTransition(async () => {
      const results = await Promise.all(
        changedKeys.map((key) =>
          setGuildConfigField(guildId, m.name, key, config[key]),
        ),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) setError(failed.error ?? "Save failed");
    });
  }

  return (
    <>
      <Card className={!enabled && !isCore ? "opacity-60" : undefined}>
        <CardHeader>
          <span className="text-2xl">{m.emoji}</span>
          <div className="grow">
            <CardTitle>{m.displayName}</CardTitle>
            <CardDescription>{m.description}</CardDescription>
          </div>
          {isCore ? (
            <Badge>Always active</Badge>
          ) : (
            <Switch
              checked={enabled}
              onChange={handleToggle}
              disabled={isPending}
              aria-label={`Toggle ${m.displayName}`}
            />
          )}
        </CardHeader>

        {m.configFields.length === 0 ? (
          <p className="text-sm text-white/40">No configurable options.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {m.configFields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <ConfigFieldLabel htmlFor={f.key}>{f.label}</ConfigFieldLabel>
                </div>
                <ConfigFieldInput
                  field={f}
                  value={config[f.key]}
                  onChange={(value) =>
                    setConfig((c) => ({ ...c, [f.key]: value }))
                  }
                />
                {f.description && (
                  <p className="text-xs text-white/40">{f.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <SaveBar
        dirty={dirty}
        saving={isPending}
        error={error}
        onSave={handleSave}
        onReset={() => setConfig(m.config)}
      />
    </>
  );
}
