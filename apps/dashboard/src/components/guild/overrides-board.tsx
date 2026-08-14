"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, SlidersHorizontal, X } from "lucide-react";
import {
  FieldType,
  type ConfigField,
  type ConfigOverrideModelType,
} from "@lumi/contracts";
import { deleteConfigOverride, setConfigOverride } from "#/actions/overrides-actions";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Input, Select } from "#/components/ui/input";
import { Glyph } from "#/components/ui/glyph";
import { ValueChip } from "#/components/ui/value-chip";
import { useStaggerIn } from "#/lib/animate";
import type {
  ConfigOverrideView,
  DashboardChannelView,
  DashboardMemberView,
  DashboardModuleView,
  DashboardRoleView,
} from "#/lib/dashboard-data";
import { formatConfigValue, isSnowflake, isUnset } from "#/lib/log-format";
import { useServerAction } from "#/lib/use-server-action";

const CATEGORY_CHANNEL_TYPE = 4;

// `guild.overrides.set` treats a null value as a delete, so an override whose
// value was never filled in would silently remove a row instead of creating
// one. Removing is its own explicit action on each row, so blank submits are
// blocked rather than quietly routed into the delete path.
function isBlankValue(value: unknown): boolean {
  return isUnset(value) || (typeof value === "string" && value.trim() === "");
}

const TARGET_TYPES: { value: ConfigOverrideModelType; label: string }[] = [
  { value: "channel", label: "Channel" },
  { value: "role", label: "Role" },
  { value: "user", label: "Member" },
  { value: "category", label: "Category" },
];

interface Directory {
  channels: DashboardChannelView[];
  roles: DashboardRoleView[];
  members: DashboardMemberView[];
}

// The worker has no separate delete action: `guild.overrides.set` with a null
// value is the delete, even though this screen presents the two separately.
export function OverridesBoard({
  guildId,
  overrides,
  modules,
  directory,
}: {
  guildId: string;
  overrides: ConfigOverrideView[];
  modules: DashboardModuleView[];
  directory: Directory;
}) {
  const [adding, setAdding] = useState(overrides.length === 0);
  const [notice, setNotice] = useState<string | null>(null);

  const moduleIndex = useMemo(
    () => new Map(modules.map((m) => [m.name, m])),
    [modules],
  );

  const groups = useMemo(() => {
    const byModule = new Map<string, ConfigOverrideView[]>();
    for (const override of overrides) {
      const list = byModule.get(override.moduleName);
      if (list) list.push(override);
      else byModule.set(override.moduleName, [override]);
    }
    return [...byModule.entries()].map(([name, items]) => ({ name, items }));
  }, [overrides]);

  const boardRef = useStaggerIn<HTMLDivElement>('[data-slot="card"]', {
    delay: 60,
    resetKey: groups.map((g) => g.name).join(","),
  });

  return (
    <div ref={boardRef} className="flex flex-col gap-4">
      <div aria-live="polite">
        {notice ? <Alert variant="info">{notice}</Alert> : null}
      </div>

      <Card>
        <CardHeader
          actions={
            <Button
              variant={adding ? "ghost" : "primary"}
              size="sm"
              onClick={() => setAdding((open) => !open)}
            >
              {adding ? <X aria-hidden /> : <Plus aria-hidden />}
              {adding ? "Cancel" : "Add an override"}
            </Button>
          }
        >
          <CardTitle>Add an override</CardTitle>
          <CardDescription>
            Pick a setting, then the one channel, category, role or member that
            should get a different value for it. Everywhere else keeps the
            server-wide value.
          </CardDescription>
        </CardHeader>
        {adding ? (
          <AddOverrideForm
            guildId={guildId}
            modules={modules}
            directory={directory}
            onAdded={(message) => {
              setNotice(message);
              setAdding(false);
            }}
          />
        ) : null}
      </Card>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={SlidersHorizontal}
            title="No overrides set"
            description="Every channel, role and member currently uses this server's module settings as they are. Add an override when one channel needs a different answer — a louder spam threshold in a memes channel, a separate log destination for staff."
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden />
                Add an override
              </Button>
            }
          />
        </Card>
      ) : (
        groups.map((group) => {
          const moduleView = moduleIndex.get(group.name);
          return (
            <Card key={group.name}>
              <CardHeader
                actions={
                  <Badge variant="neutral" className="tabular">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "override" : "overrides"}
                  </Badge>
                }
              >
                <CardTitle className="flex items-center gap-2">
                  {moduleView ? (
                    <Glyph emoji={moduleView.emoji} size="sm" />
                  ) : null}
                  {moduleView?.displayName || group.name}
                </CardTitle>
                <CardDescription>
                  {moduleView
                    ? "Server-wide values come from this module's settings form."
                    : "This module is no longer installed, so its server-wide values can't be read. The overrides below are still stored."}
                </CardDescription>
              </CardHeader>
              <ul className="divide-y divide-border">
                {group.items.map((override) => (
                  <OverrideRow
                    key={override.id}
                    guildId={guildId}
                    override={override}
                    moduleView={moduleView}
                    directory={directory}
                    onDone={setNotice}
                  />
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

function OverrideRow({
  guildId,
  override,
  moduleView,
  directory,
  onDone,
}: {
  guildId: string;
  override: ConfigOverrideView;
  moduleView: DashboardModuleView | undefined;
  directory: Directory;
  onDone: (message: string) => void;
}) {
  const field = moduleView?.configFields.find((f) => f.key === override.key);
  const baseline = moduleView ? moduleView.config[override.key] : undefined;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(override.value);
  const [removing, setRemoving] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  const target = describeTarget(override.modelType, override.modelId, directory);
  const settingName = field?.label || override.key;

  function save() {
    if (isBlankValue(draft)) {
      setError(
        `Clearing the value would delete this override, not change it. Use Remove if ${target.name} should go back to the server-wide value.`,
      );
      return;
    }
    run(async () => {
      const result = await setConfigOverride(
        guildId,
        override.moduleName,
        override.key,
        override.modelType as ConfigOverrideModelType,
        override.modelId,
        draft,
      );
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't save the override. Check that it is online, then try again.",
        );
        return;
      }
      setEditing(false);
      onDone(
        `${settingName} for ${target.name} is now ${describeValue(field, draft, directory) ?? "unset"}.`,
      );
    });
  }

  function remove() {
    run(async () => {
      const result = await deleteConfigOverride(
        guildId,
        override.moduleName,
        override.key,
        override.modelType as ConfigOverrideModelType,
        override.modelId,
      );
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't remove the override. Check that it is online, then try again.",
        );
        return;
      }
      setRemoving(false);
      onDone(
        `Removed the ${settingName} override for ${target.name}. It uses the server-wide value again.`,
      );
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:w-56">
        <Badge variant="outline">{target.typeLabel}</Badge>
        <span className="truncate text-[13px] text-fg" title={target.name}>
          {target.name}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-fg-muted">{settingName}</p>
        {editing ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <ValueInput
                field={field}
                value={draft}
                onChange={setDraft}
                directory={directory}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={save}
            >
              {isPending ? "Saving…" : "Save value"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setDraft(override.value);
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ValueChip text={describeValue(field, baseline, directory)} />
            <ArrowRight aria-hidden className="size-3.5 text-fg-subtle" />
            <span className="sr-only">overridden with</span>
            <ValueChip
              text={describeValue(field, override.value, directory)}
              emphasis
            />
          </div>
        )}
        {removing ? null : <ActionError error={error} className="mt-2" />}
      </div>

      {editing ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Change the ${settingName} override for ${target.name}`}
            onClick={() => {
              setError(null);
              setDraft(override.value);
              setEditing(true);
            }}
          >
            Change
          </Button>
          <Button
            variant="dangerGhost"
            size="sm"
            aria-label={`Remove the ${settingName} override for ${target.name}`}
            onClick={() => {
              setError(null);
              setRemoving(true);
            }}
          >
            Remove
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={removing}
        title={`Remove this ${settingName} override?`}
        description={
          <>
            {target.name} goes back to the server-wide value,{" "}
            {describeValue(field, baseline, directory) ?? "which is not set"}.
            The override value{" "}
            {describeValue(field, override.value, directory) ?? "(unset)"} is
            not kept anywhere — adding it back means entering it again.
          </>
        }
        confirmLabel="Remove override"
        pendingLabel="Removing…"
        pending={isPending}
        error={error}
        onConfirm={remove}
        onClose={() => {
          if (isPending) return;
          setRemoving(false);
          setError(null);
        }}
      />
    </li>
  );
}

function AddOverrideForm({
  guildId,
  modules,
  directory,
  onAdded,
}: {
  guildId: string;
  modules: DashboardModuleView[];
  directory: Directory;
  onAdded: (message: string) => void;
}) {
  const [moduleName, setModuleName] = useState("");
  const [key, setKey] = useState("");
  const [modelType, setModelType] = useState<ConfigOverrideModelType>("channel");
  const [modelId, setModelId] = useState("");
  const [value, setValue] = useState<unknown>(null);
  const { isPending, error, setError, run } = useServerAction();

  const moduleView = modules.find((m) => m.name === moduleName);
  const field = moduleView?.configFields.find((f) => f.key === key);
  const targetOptions = targetOptionsFor(modelType, directory);
  const needsTypedId = modelType === "user";
  const targetValid = needsTypedId ? isSnowflake(modelId) : Boolean(modelId);
  const valueValid = !isBlankValue(value);
  const ready = Boolean(moduleView && field && targetValid && valueValid);

  function submit() {
    if (!moduleView || !field || !targetValid || !valueValid) return;
    run(async () => {
      const result = await setConfigOverride(
        guildId,
        moduleView.name,
        field.key,
        modelType,
        modelId,
        value,
      );
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't save the override. Check that it is online, then try again.",
        );
        return;
      }
      const target = describeTarget(modelType, modelId, directory);
      onAdded(
        `${field.label || field.key} for ${target.name} is now ${describeValue(field, value, directory) ?? "unset"}.`,
      );
      setKey("");
      setModelId("");
      setValue(null);
    });
  }

  return (
    <CardBody className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Module" htmlFor="override-module">
          <Select
            id="override-module"
            value={moduleName}
            onChange={(e) => {
              setModuleName(e.target.value);
              setKey("");
              setValue(null);
            }}
          >
            <option value="">Select a module…</option>
            {modules.map((m) => (
              <option key={m.name} value={m.name}>
                {m.displayName || m.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Setting"
          htmlFor="override-key"
          hint={field ? field.description : undefined}
        >
          <Select
            id="override-key"
            value={key}
            disabled={!moduleView}
            onChange={(e) => {
              setKey(e.target.value);
              const next = moduleView?.configFields.find(
                (f) => f.key === e.target.value,
              );
              setValue(next ? (moduleView?.config[next.key] ?? null) : null);
            }}
          >
            <option value="">
              {moduleView ? "Select a setting…" : "Pick a module first"}
            </option>
            {(moduleView?.configFields ?? []).map((f) => (
              <option key={f.key} value={f.key}>
                {f.label || f.key}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Applies to" htmlFor="override-type">
          <Select
            id="override-type"
            value={modelType}
            onChange={(e) => {
              setModelType(e.target.value as ConfigOverrideModelType);
              setModelId("");
            }}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={needsTypedId ? "Member ID" : "Target"}
          htmlFor="override-target"
          hint={
            needsTypedId
              ? "A Discord user ID — 15 to 20 digits, copied with Developer Mode on."
              : undefined
          }
        >
          {needsTypedId ? (
            <Input
              id="override-target"
              inputMode="numeric"
              className="tabular font-mono text-[12px]"
              placeholder="e.g. 328473289473289473"
              value={modelId}
              onChange={(e) => setModelId(e.target.value.trim())}
            />
          ) : (
            <Select
              id="override-target"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              <option value="">Select…</option>
              {targetOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {field ? (
        <Field
          htmlFor={field.key}
          label={`Value for this ${TARGET_TYPES.find((t) => t.value === modelType)?.label.toLowerCase()}`}
          hint={`Server-wide, ${field.label || field.key} is ${describeValue(field, moduleView?.config[field.key], directory) ?? "not set"}.`}
          className="max-w-sm"
        >
          <ValueInput
            field={field}
            value={value}
            onChange={setValue}
            directory={directory}
          />
        </Field>
      ) : null}

      <ActionError error={error} />

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!ready || isPending}
          onClick={submit}
        >
          {isPending ? "Saving…" : "Save override"}
        </Button>
        {moduleView && field && !targetValid ? (
          <span className="text-[11px] text-fg-subtle">
            Choose what this applies to first.
          </span>
        ) : moduleView && field && !valueValid ? (
          <span className="text-[11px] text-fg-subtle">
            Enter the value this target should use instead — an override with no
            value of its own wouldn&apos;t change anything.
          </span>
        ) : null}
      </div>
    </CardBody>
  );
}

function ValueInput({
  field,
  value,
  onChange,
  directory,
}: {
  field: ConfigField | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  directory: Directory;
}) {
  if (!field) {
    return (
      <Input
        className="font-mono text-[12px]"
        value={typeof value === "string" ? value : formatConfigValue(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <ConfigFieldInput
      field={field}
      value={value}
      onChange={onChange}
      roles={directory.roles}
      channels={directory.channels}
    />
  );
}

function targetOptionsFor(
  modelType: ConfigOverrideModelType,
  directory: Directory,
): { id: string; label: string }[] {
  switch (modelType) {
    case "role":
      return directory.roles.map((r) => ({ id: r.id, label: `@${r.name}` }));
    case "category":
      return directory.channels
        .filter((c) => c.type === CATEGORY_CHANNEL_TYPE)
        .map((c) => ({ id: c.id, label: c.name }));
    case "user":
      return directory.members.map((m) => ({
        id: m.id,
        label: m.displayName || m.username,
      }));
    default:
      return directory.channels
        .filter((c) => c.type !== CATEGORY_CHANNEL_TYPE)
        .map((c) => ({ id: c.id, label: `#${c.name}` }));
  }
}

function describeTarget(
  modelType: string,
  modelId: string,
  directory: Directory,
): { typeLabel: string; name: string } {
  switch (modelType) {
    case "role": {
      const role = directory.roles.find((r) => r.id === modelId);
      return { typeLabel: "Role", name: role ? `@${role.name}` : modelId };
    }
    case "user": {
      const member = directory.members.find((m) => m.id === modelId);
      return {
        typeLabel: "Member",
        name: member ? member.displayName || member.username : modelId,
      };
    }
    case "category": {
      const channel = directory.channels.find((c) => c.id === modelId);
      return { typeLabel: "Category", name: channel ? channel.name : modelId };
    }
    default: {
      const channel = directory.channels.find((c) => c.id === modelId);
      return {
        typeLabel: "Channel",
        name: channel ? `#${channel.name}` : modelId,
      };
    }
  }
}

function describeValue(
  field: ConfigField | undefined,
  value: unknown,
  directory: Directory,
): string | null {
  if (isUnset(value)) return null;
  if (typeof value === "string" && field) {
    if (field.type === FieldType.CHANNEL) {
      const channel = directory.channels.find((c) => c.id === value);
      return channel ? `#${channel.name}` : value;
    }
    if (field.type === FieldType.ROLE) {
      const role = directory.roles.find((r) => r.id === value);
      return role ? `@${role.name}` : value;
    }
    if (field.type === FieldType.USER) {
      const member = directory.members.find((m) => m.id === value);
      return member ? member.displayName || member.username : value;
    }
  }
  return formatConfigValue(value);
}
