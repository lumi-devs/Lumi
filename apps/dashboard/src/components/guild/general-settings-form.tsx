"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuildSettingsPayload } from "@lumi/contracts";
import { setGuildSettings } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Field, Input, Select } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type {
  GuildSettings,
  DashboardRoleView,
  DashboardChannelView,
} from "#/lib/dashboard-data";

const LOG_CHANNEL_TYPES = new Set([0, 5]);

type FormState = GuildSettingsPayload;

const FORM_KEYS = [
  "prefix",
  "modRoleId",
  "adminRoleId",
  "modLogChannelId",
  "muteRoleId",
  "locale",
  "timezone",
  "noMentionSpamWindowMs",
  "noMentionSpamLimit",
] as const satisfies readonly (keyof FormState)[];

const FIELD_LABELS: Record<keyof FormState, string> = {
  prefix: "Command prefix",
  modRoleId: "Mod role",
  adminRoleId: "Admin role",
  modLogChannelId: "Mod log channel",
  muteRoleId: "Mute role",
  locale: "Locale",
  timezone: "Timezone",
  noMentionSpamWindowMs: "No-mention-spam window (ms)",
  noMentionSpamLimit: "No-mention-spam limit",
};

const NULLABLE_STRING_FIELDS = new Set<keyof FormState>([
  "prefix",
  "modRoleId",
  "adminRoleId",
  "modLogChannelId",
  "muteRoleId",
]);

function toFormState(settings: GuildSettings): FormState {
  return {
    prefix: settings.prefix ?? "",
    modRoleId: (settings["modRoleId"]) ?? "",
    adminRoleId: (settings["adminRoleId"]) ?? "",
    modLogChannelId: (settings["modLogChannelId"]) ?? "",
    muteRoleId: (settings["muteRoleId"]) ?? "",
    locale: settings.locale ?? "en-US",
    timezone: (settings["timezone"]) ?? "UTC",
    noMentionSpamWindowMs: (settings["noMentionSpamWindowMs"]) ?? null,
    noMentionSpamLimit: (settings["noMentionSpamLimit"]) ?? null,
  };
}

function channelName(guildId: string) {
  return `lumi:guild-settings:${guildId}`;
}

type SyncMessage =
  | { type: "settings-updated"; settings: FormState }
  | { type: "request-sync" };

export function GeneralSettingsForm({
  guildId,
  settings,
  roles,
  channels,
}: {
  guildId: string;
  settings: GuildSettings;
  roles: DashboardRoleView[];
  channels: DashboardChannelView[];
}) {
  const [baseline, setBaseline] = useState<FormState>(() => toFormState(settings));
  const [form, setForm] = useState<FormState>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const baselineRef = useRef(baseline);
  const formRef = useRef(form);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const mergeIncoming = useCallback(
    (newBaseline: FormState) => {
      const oldBaseline = baselineRef.current;
      const currentForm = formRef.current;
      const conflicts: (keyof FormState)[] = [];
      let changed = false;
      const next = { ...currentForm };

      for (const key of FORM_KEYS) {
        if (JSON.stringify(newBaseline[key]) === JSON.stringify(oldBaseline[key])) {
          continue;
        }
        const fieldDirty = JSON.stringify(currentForm[key]) !== JSON.stringify(oldBaseline[key]);
        if (fieldDirty) {
          conflicts.push(key);
        } else {
          (next as Record<string, unknown>)[key] = newBaseline[key];
          changed = true;
        }
      }

      if (changed) {
        formRef.current = next;
        setForm(next);
      }
      baselineRef.current = newBaseline;
      setBaseline(newBaseline);

      if (conflicts.length > 0) {
        const names = conflicts.map((k) => FIELD_LABELS[k]).join(", ");
        setError(
          `${names} ${conflicts.length === 1 ? "was" : "were"} changed in another tab while you were editing. ` +
            "Your unsaved changes were kept — Save to overwrite, or Reset to load the latest value.",
        );
      }
    },
    [setError],
  );

  const prevSettingsRef = useRef(settings);
  useEffect(() => {
    if (settings === prevSettingsRef.current) return;
    prevSettingsRef.current = settings;
    mergeIncoming(toFormState(settings));
  }, [settings, mergeIncoming]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(channelName(guildId));
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      if (msg.type === "settings-updated") {
        mergeIncoming(msg.settings);
      } else if (msg.type === "request-sync") {
        channel.postMessage({
          type: "settings-updated",
          settings: baselineRef.current,
        } satisfies SyncMessage);
      }
    };

    function requestSync() {
      channel.postMessage({ type: "request-sync" } satisfies SyncMessage);
    }
    requestSync();
    window.addEventListener("focus", requestSync);

    return () => {
      window.removeEventListener("focus", requestSync);
      channel.close();
      channelRef.current = null;
    };
  }, [guildId, mergeIncoming]);

  function handleSave() {
    run(async () => {
      const changedKeys = (Object.keys(form) as (keyof FormState)[]).filter(
        (key) => JSON.stringify(form[key]) !== JSON.stringify(baseline[key]),
      );
      if (changedKeys.length === 0) return;

      const patch = Object.fromEntries(
        changedKeys.map((key) => {
          const value = form[key];
          return [key, NULLABLE_STRING_FIELDS.has(key) && value === "" ? null : value];
        }),
      ) as GuildSettingsPayload;

      const res = await setGuildSettings(guildId, patch);
      if (!res.ok) {
        setError(res.error ?? "Save failed");
        return;
      }

      const normalized = { ...form, ...patch };
      setBaseline(normalized);
      baselineRef.current = normalized;
      setForm(normalized);
      formRef.current = normalized;
      channelRef.current?.postMessage({
        type: "settings-updated",
        settings: normalized,
      } satisfies SyncMessage);
    });
  }

  return (
    <>
      {/* `rise` sits here, not on a wrapper in page.tsx, so the fixed-position
       * SaveBar below stays outside the animated subtree. */}
      <div
        className="rise flex flex-col gap-4"
        style={{ "--rise-delay": "140ms" } as React.CSSProperties}
      >
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Command prefix and localisation for this server.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Command prefix"
              htmlFor="prefix"
              hint="Blank uses the bot-wide default."
            >
              <Input
                id="prefix"
                maxLength={5}
                placeholder="(uses global default)"
                value={form.prefix ?? ""}
                onChange={(e) => field("prefix", e.target.value)}
              />
            </Field>
            <Field label="Locale" htmlFor="locale" hint="BCP-47 tag, e.g. en-US.">
              <Input
                id="locale"
                value={form.locale ?? ""}
                onChange={(e) => field("locale", e.target.value)}
              />
            </Field>
            <Field label="Timezone" htmlFor="timezone" hint="IANA name, e.g. Europe/Berlin.">
              <Input
                id="timezone"
                value={form.timezone ?? ""}
                onChange={(e) => field("timezone", e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roles &amp; channels</CardTitle>
            <CardDescription>
              Staff roles and the mod log destination for this server.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Mod role" htmlFor="modRoleId">
              <Select
                id="modRoleId"
                value={form.modRoleId ?? ""}
                onChange={(e) => field("modRoleId", e.target.value || null)}
              >
                <option value="">None</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Admin role" htmlFor="adminRoleId">
              <Select
                id="adminRoleId"
                value={form.adminRoleId ?? ""}
                onChange={(e) => field("adminRoleId", e.target.value || null)}
              >
                <option value="">None</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mute role" htmlFor="muteRoleId">
              <Select
                id="muteRoleId"
                value={form.muteRoleId ?? ""}
                onChange={(e) => field("muteRoleId", e.target.value || null)}
              >
                <option value="">None</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mod log channel" htmlFor="modLogChannelId">
              <Select
                id="modLogChannelId"
                value={form.modLogChannelId ?? ""}
                onChange={(e) => field("modLogChannelId", e.target.value || null)}
              >
                <option value="">None</option>
                {channels
                  .filter((c) => LOG_CHANNEL_TYPES.has(c.type))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mention spam</CardTitle>
            <CardDescription>
              Leave both blank to disable mention-spam protection entirely.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="No-mention-spam limit"
              htmlFor="noMentionSpamLimit"
              hint="Mentions allowed inside the window."
            >
              <Input
                id="noMentionSpamLimit"
                type="number"
                className="tabular"
                placeholder="Disabled"
                value={form.noMentionSpamLimit ?? ""}
                onChange={(e) =>
                  field(
                    "noMentionSpamLimit",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="No-mention-spam window (ms)"
              htmlFor="noMentionSpamWindowMs"
              hint="Rolling window length in milliseconds."
            >
              <Input
                id="noMentionSpamWindowMs"
                type="number"
                className="tabular"
                placeholder="Disabled"
                value={form.noMentionSpamWindowMs ?? ""}
                onChange={(e) =>
                  field(
                    "noMentionSpamWindowMs",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
          </CardBody>
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        saving={isPending}
        error={error}
        onSave={handleSave}
        onReset={() => {
          setForm(baseline);
          setError(null);
        }}
      />
    </>
  );
}
