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
import type { ConfigField } from "@lumi/contracts";

/** Groups fields by their declared `group`, preserving first-seen order.
 * Mirrors the Discord panel's section split (`sectionsFor` in
 * `modules/core/ui/modules.ts`) so both surfaces read the same schema the
 * same way. Modules with no grouped fields collapse to a single unnamed
 * section, rendered flat with no header. */
function sectionsFor(fields: ConfigField[]): { name: string | null; fields: ConfigField[] }[] {
  if (!fields.some((f) => f.group)) return [{ name: null, fields }];
  const order: string[] = [];
  const map = new Map<string, ConfigField[]>();
  for (const f of fields) {
    const g = f.group ?? "General";
    let arr = map.get(g);
    if (!arr) {
      arr = [];
      map.set(g, arr);
      order.push(g);
    }
    arr.push(f);
  }
  return order.map((name) => ({ name, fields: map.get(name)! }));
}

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
  const fieldsRef = useStaggerIn<HTMLDivElement>(".cfg-row");
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
          <div ref={fieldsRef} className={inactive ? "opacity-60" : undefined}>
            {sectionsFor(m.configFields).map((section) => (
              <div key={section.name ?? "__flat"}>
                {section.name ? (
                  <h4 className="cfg-row font-display flex items-baseline justify-between gap-3 border-y border-border bg-bg-subtle px-4 py-1.5 text-[13px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
                    <span>{section.name}</span>
                    <span className="tabular">
                      {section.fields.length}{" "}
                      {section.fields.length === 1 ? "setting" : "settings"}
                    </span>
                  </h4>
                ) : null}
                <div className="divide-y divide-border">
                  {section.fields.map((f) => (
                    <SettingRow
                      key={f.key}
                      htmlFor={f.key}
                      label={f.label}
                      description={f.description}
                      className="cfg-row transition-colors duration-fast hover:bg-bg-subtle/60"
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
