"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { setGuildConfigField, toggleGuildModule } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Badge } from "#/components/ui/badge";
import { Glyph } from "#/components/ui/glyph";
import { EmptyState } from "#/components/ui/empty-state";
import { SettingRow } from "#/components/ui/input";
import { ConfigFieldInput } from "./config-field-input";
import { useServerAction } from "#/lib/use-server-action";
import { useStaggerIn } from "#/lib/animate";
import type {
  DashboardModuleView,
  DashboardRoleView,
  DashboardChannelView,
} from "#/lib/dashboard-data";

export function ModuleConfigForm({
  guildId,
  module: m,
  roles,
  channels,
}: {
  guildId: string;
  module: DashboardModuleView;
  roles: DashboardRoleView[];
  channels: DashboardChannelView[];
}) {
  const isCore = m.name === "core";
  const fieldsRef = useStaggerIn<HTMLDivElement>("> div");
  const [enabled, setEnabled] = useState(m.enabled);
  const [config, setConfig] = useState<Record<string, unknown>>(m.config);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(config) !== JSON.stringify(m.config);
  const inactive = !enabled && !isCore;

  function handleToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    run(async () => {
      const res = await toggleGuildModule(guildId, m.name, next);
      if (!res.ok) {
        setEnabled(prev);
        setError(res.error ?? "Failed to toggle");
      }
    });
  }

  function handleSave() {
    const changedKeys = Object.keys(config).filter(
      (k) => JSON.stringify(config[k]) !== JSON.stringify(m.config[k]),
    );
    run(async () => {
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
      <Card>
        <CardHeader
          className="items-center"
          actions={
            isCore ? (
              <Badge variant="neutral">Always active</Badge>
            ) : (
              <>
                <Badge variant={enabled ? "success" : "neutral"} dot>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={enabled}
                  onChange={handleToggle}
                  disabled={isPending}
                  aria-label={`Toggle ${m.displayName}`}
                />
              </>
            )
          }
        >
          <div className="flex items-center gap-2.5">
            <Glyph emoji={m.emoji} />
            <div className="min-w-0">
              <CardTitle>{m.displayName}</CardTitle>
              <CardDescription>{m.short ? `${m.short} — ${m.description}` : m.description}</CardDescription>
              {m.endUserDataStatement && (
                <p className="mt-1 text-[12px] text-fg-subtle">
                  <span className="font-medium text-fg-muted">Data & Privacy:</span> {m.endUserDataStatement}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        {m.configFields.length === 0 ? (
          <EmptyState
            compact
            icon={SlidersHorizontal}
            title="No configurable options"
            description="This module works out of the box — enabling it is the only setting."
          />
        ) : (
          <div
            ref={fieldsRef}
            className={inactive ? "divide-y divide-border opacity-60" : "divide-y divide-border"}
          >
            {m.configFields.map((f) => (
              <SettingRow
                key={f.key}
                htmlFor={f.key}
                label={f.label}
                description={f.description}
                control={
                  <ConfigFieldInput
                    field={f}
                    value={config[f.key]}
                    onChange={(value) =>
                      setConfig((c) => ({ ...c, [f.key]: value }))
                    }
                    roles={roles}
                    channels={channels}
                  />
                }
              />
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
