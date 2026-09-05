"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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
import { useStaggerIn } from "#/lib/animate";
import type { GuildSettings, DashboardRoleView } from "#/lib/dashboard-data";

type FormState = GuildSettingsPayload;

const FormKeys = [
  "prefix",
  "muteRoleId",
  "locale",
  "timezone",
] as const satisfies readonly (keyof FormState)[];

const FieldLabels: Record<keyof FormState, string> = {
  prefix: "Command prefix",
  muteRoleId: "Mute role",
  locale: "Locale",
  timezone: "Timezone",
};

const NullableStringFields = new Set<keyof FormState>(["prefix", "muteRoleId"]);

function toFormState(settings: GuildSettings): FormState {
  return {
    prefix: settings.prefix ?? "",
    muteRoleId: (settings["muteRoleId"]) ?? "",
    locale: settings.locale ?? "en-US",
    timezone: (settings["timezone"]) ?? "UTC",
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
}: {
  guildId: string;
  settings: GuildSettings;
  roles: DashboardRoleView[];
}) {
  const sectionsRef = useStaggerIn<HTMLDivElement>("> div");
  const [baseline, setBaseline] = useState<FormState>(() => toFormState(settings));
  const [form, setForm] = useState<FormState>(baseline);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

      for (const key of FormKeys) {
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
        const names = conflicts.map((k) => FieldLabels[k]).join(", ");
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
          return [key, NullableStringFields.has(key) && value === "" ? null : value];
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
        ref={sectionsRef}
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
          <CardHeader
            actions={
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
              >
                <ChevronRight
                  size={16}
                  className={`transition-transform duration-200 ${advancedOpen ? "rotate-90" : ""}`}
                />
                Advanced
                <span className="text-fg-subtle">· 2 settings · mute role, ignored channels</span>
              </button>
            }
          >
            <CardTitle>Advanced</CardTitle>
          </CardHeader>
          {advancedOpen ? (
            <CardBody className="grid animate-in fade-in slide-in-from-top-1 grid-cols-1 gap-4 duration-200 sm:grid-cols-2">
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
              <Field label="Ignored channels" htmlFor="ignored-channels-link">
                <Link
                  id="ignored-channels-link"
                  href={`/guild/${guildId}/config/advanced`}
                  className="flex h-9 items-center rounded-control border border-border bg-bg-subtle px-3 text-sm text-accent hover:underline"
                >
                  Manage on the Advanced page →
                </Link>
              </Field>
            </CardBody>
          ) : null}
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
