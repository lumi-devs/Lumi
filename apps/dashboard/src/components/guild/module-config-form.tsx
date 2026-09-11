"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { sendWelcomeTest, setGuildConfigField, toggleGuildModule } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Badge } from "#/components/ui/badge";
import { Glyph } from "#/components/ui/glyph";
import { EmptyState } from "#/components/ui/empty-state";
import { Input, SettingRow } from "#/components/ui/input";
import { CollapsibleSection } from "#/components/ui/collapsible-section";
import { ConfigFieldInput, isWideField } from "./config-field-input";
import { useServerAction } from "#/lib/use-server-action";
import { useStaggerIn } from "#/lib/animate";
import { cn } from "#/lib/utils";
import type {
  DashboardModuleView,
  DashboardRoleView,
  DashboardChannelView,
} from "#/lib/dashboard-data";
import { FieldType, type ConfigField, type WelcomeTestKind } from "@lumi/contracts";

/** Welcome module only: which "send test" kind each preview-bearing field
 * belongs to, so its preview can carry a working Save & send test button
 * instead of being a disconnected mockup. */
const TestKindForField: Record<string, WelcomeTestKind> = {
  welcomeTemplate: "welcome",
  welcomeRichContent: "welcome",
  goodbyeTemplate: "goodbye",
  goodbyeRichContent: "goodbye",
};

/** Fallback section for fields that declare no `group`. */
const FallbackGroupName = "General";

/** Welcome module only: simple fields whose effect is fully covered once the
 * paired Advanced Layout block editor has content — the worker uses the rich
 * layout instead of these the moment it has any blocks, so leaving them look
 * live at that point is misleading rather than merely redundant. */
const SupersededByRichContent: Record<string, string> = {
  welcomeAccentColor: "welcomeRichContent",
  welcomeThumbnailUrl: "welcomeRichContent",
  welcomeImageUrls: "welcomeRichContent",
  welcomeFooter: "welcomeRichContent",
};

function hasBlocks(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { blocks?: unknown }).blocks) &&
    (value as { blocks: unknown[] }).blocks.length > 0
  );
}

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
    const g = f.group ?? FallbackGroupName;
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

  const sections = useMemo(() => sectionsFor(m.configFields), [m.configFields]);
  const tabbed = sections.length > 1;
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const visibleGroup = activeGroup ?? sections[0]?.name ?? null;

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const renderedSections = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(
        (f) =>
          !searching ||
          f.label.toLowerCase().includes(needle) ||
          f.description.toLowerCase().includes(needle) ||
          f.key.toLowerCase().includes(needle),
      ),
    }))
    .filter((section) => {
      if (searching) return section.fields.length > 0;
      if (tabbed) return section.name === visibleGroup;
      return true;
    });
  const showHeaders = !tabbed || searching;
  const matchCount = renderedSections.reduce((n, s) => n + s.fields.length, 0);

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

  /** Persists every unsaved field, then fires the test send — the button
   * attached to a preview does both so there's no separate disconnected
   * "Save" step before the preview's send actually reflects it. */
  async function saveAndTest(kind: WelcomeTestKind): Promise<{ ok: boolean; error?: string }> {
    const changedKeys = Object.keys(config).filter(
      (k) => JSON.stringify(config[k]) !== JSON.stringify(m.config[k]),
    );
    if (changedKeys.length > 0) {
      const results = await Promise.all(
        changedKeys.map((key) => setGuildConfigField(guildId, m.name, key, config[key])),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) return { ok: false, error: failed.error ?? "Save failed" };
    }
    return sendWelcomeTest(guildId, kind);
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
            <div className="border-b border-border px-4 py-2.5">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings…"
                  aria-label={`Search ${m.displayName} settings`}
                  className="pl-8"
                />
              </div>
            </div>
            {tabbed && !searching ? (
              <div
                role="tablist"
                aria-label={`${m.displayName} setting groups`}
                className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2"
              >
                {sections.map((section) => {
                  const selected = section.name === visibleGroup;
                  return (
                    <button
                      key={section.name ?? FallbackGroupName}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveGroup(section.name)}
                      className={cn(
                        "font-display inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold tracking-[0.02em] whitespace-nowrap transition-colors duration-fast",
                        selected
                          ? "bg-accent-soft text-accent-fg"
                          : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                      )}
                    >
                      {section.name}
                      <span className="tabular text-[12px] opacity-70">
                        {section.fields.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {searching && matchCount === 0 ? (
              <EmptyState
                compact
                icon={Search}
                title="No matching settings"
                description={`Nothing in ${m.displayName} matches “${query.trim()}”.`}
              />
            ) : (
              renderedSections.map((section, index) => {
                const toggleFields = section.fields.filter(
                  (f) => f.type === FieldType.Boolean,
                );
                const otherFields = section.fields.filter(
                  (f) => f.type !== FieldType.Boolean,
                );
                const rows = (
                  <div className="flex flex-col gap-4 px-4 py-3">
                    {toggleFields.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {toggleFields.map((f) => (
                          <SettingRow
                            key={f.key}
                            htmlFor={f.key}
                            label={f.label}
                            hint={f.description}
                            className="cfg-row rounded-control border border-border bg-surface px-3.5 transition-colors duration-fast hover:border-border-strong"
                            control={
                              <ConfigFieldInput
                                field={f}
                                value={config[f.key]}
                                onChange={(value) =>
                                  setConfig((c) => ({ ...c, [f.key]: value }))
                                }
                                config={config}
                                roles={roles}
                                channels={channels}
                                guildId={guildId}
                              />
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                    {otherFields.length > 0 ? (
                      <div className="divide-y divide-border-soft">
                        {otherFields.map((f) => {
                          const richKey = m.name === "welcome" ? SupersededByRichContent[f.key] : undefined;
                          const superseded = richKey ? hasBlocks(config[richKey]) : false;
                          const testKind = m.name === "welcome" ? TestKindForField[f.key] : undefined;
                          return (
                            <SettingRow
                              key={f.key}
                              htmlFor={f.key}
                              label={f.label}
                              hint={f.description}
                              description={
                                superseded
                                  ? "Superseded by Advanced Layout below — clear its blocks to use this again."
                                  : undefined
                              }
                              wide={isWideField(f)}
                              className={cn(
                                "cfg-row transition-colors duration-fast hover:bg-bg-subtle/60",
                                superseded && "opacity-50",
                              )}
                              control={
                                <div className={superseded ? "pointer-events-none" : undefined}>
                                  <ConfigFieldInput
                                    field={f}
                                    value={config[f.key]}
                                    onChange={(value) =>
                                      setConfig((c) => ({ ...c, [f.key]: value }))
                                    }
                                    config={config}
                                    roles={roles}
                                    channels={channels}
                                    guildId={guildId}
                                    saveAndTest={
                                      testKind
                                        ? {
                                            label: `Save & send test ${testKind} message`,
                                            action: () => saveAndTest(testKind),
                                          }
                                        : undefined
                                    }
                                  />
                                </div>
                              }
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
                const panelRole = tabbed && !searching ? "tabpanel" : undefined;
                if (!showHeaders || !section.name) {
                  return (
                    <div key={section.name ?? "__flat"} role={panelRole}>
                      {rows}
                    </div>
                  );
                }
                return (
                  <CollapsibleSection
                    key={section.name}
                    title={section.name}
                    count={section.fields.length}
                    countLabel="setting"
                    defaultOpen={index === 0 || searching}
                    className="cfg-row"
                  >
                    <div role={panelRole}>{rows}</div>
                  </CollapsibleSection>
                );
              })
            )}
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
