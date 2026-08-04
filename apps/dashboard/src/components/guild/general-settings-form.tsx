"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuildSettingsPayload } from "@lumi/contracts";
import { setGuildSettings } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Input, Label } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { GuildSettings } from "#/lib/dashboard-data";

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
  modRoleId: "Mod role ID",
  adminRoleId: "Admin role ID",
  modLogChannelId: "Mod log channel ID",
  muteRoleId: "Mute role ID",
  locale: "Locale",
  timezone: "Timezone",
  noMentionSpamWindowMs: "No-mention-spam window (ms)",
  noMentionSpamLimit: "No-mention-spam limit",
};

function toFormState(settings: GuildSettings): FormState {
  return {
    prefix: settings.prefix ?? "",
    modRoleId: (settings["modRoleId"] as string | null) ?? "",
    adminRoleId: (settings["adminRoleId"] as string | null) ?? "",
    modLogChannelId: (settings["modLogChannelId"] as string | null) ?? "",
    muteRoleId: (settings["muteRoleId"] as string | null) ?? "",
    locale: settings.locale ?? "en-US",
    timezone: (settings["timezone"] as string) ?? "UTC",
    noMentionSpamWindowMs: (settings["noMentionSpamWindowMs"] as number | null) ?? null,
    noMentionSpamLimit: (settings["noMentionSpamLimit"] as number | null) ?? null,
  };
}

/**
 * Cross-tab sync for this guild's settings — `BroadcastChannel` only
 * reaches other browsing contexts (tabs/windows) of the *same origin*, so
 * one channel per guild keeps unrelated guild pages from cross-talking.
 */
function channelName(guildId: string) {
  return `lumi:guild-settings:${guildId}`;
}

type SyncMessage =
  | { type: "settings-updated"; settings: FormState }
  | { type: "request-sync" };

/** dashboard.md §9B `GuildGeneralSettingsCard` — Guild model fields. */
export function GeneralSettingsForm({
  guildId,
  settings,
}: {
  guildId: string;
  settings: GuildSettings;
}) {
  const [baseline, setBaseline] = useState<FormState>(() => toFormState(settings));
  const [form, setForm] = useState<FormState>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  // Mirror `baseline`/`form` so the BroadcastChannel handler (registered
  // once, in an effect) and `mergeIncoming` always read the latest values
  // instead of ones captured at subscribe/memoize time. Reading these
  // synchronously (rather than via a `setForm(f => ...)` updater callback)
  // also sidesteps React not guaranteeing an updater runs before the code
  // after the `setForm(...)` call — `mergeIncoming` needs the "did the user
  // touch this field" answer *before* deciding whether to call `setError`.
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

  /**
   * Applies settings that changed *outside this form instance* — another
   * tab's save (via BroadcastChannel) or this tab's own save round-tripping
   * back through a fresh `settings` prop (via Next's Server Action
   * revalidation). For each field:
   *  - untouched here (form already matched the old baseline) → silently
   *    adopt the new value, so this tab never displays stale data.
   *  - actively edited here and not yet saved → keep the local edit, but
   *    surface a conflict so the user knows their pending change is now
   *    based on out-of-date data, rather than silently guessing.
   */
  const mergeIncoming = useCallback(
    (newBaseline: FormState) => {
      const oldBaseline = baselineRef.current;
      const currentForm = formRef.current;
      const conflicts: (keyof FormState)[] = [];
      let changed = false;
      const next = { ...currentForm };

      for (const key of FORM_KEYS) {
        if (JSON.stringify(newBaseline[key]) === JSON.stringify(oldBaseline[key])) {
          continue; // this field didn't actually change remotely
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

  // Own-tab case: `setGuildSettings`'s `revalidatePath` makes Next refresh
  // this route's RSC payload, which flows back in as a new `settings`
  // prop — this is also where that lands, no separate optimistic-update
  // path is needed for the tab that actually clicked Save.
  const prevSettingsRef = useRef(settings);
  useEffect(() => {
    if (settings === prevSettingsRef.current) return;
    prevSettingsRef.current = settings;
    mergeIncoming(toFormState(settings));
  }, [settings, mergeIncoming]);

  // Cross-tab case: a `BroadcastChannel` per guild. Tabs gossip rather than
  // one tab pushing to a known list — any tab can answer a `request-sync`
  // with whatever it currently believes the baseline is, so a tab that
  // opens (or wakes from being backgrounded/frozen) after another tab's
  // save still catches up even though it missed the original broadcast.
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
      const normalized: GuildSettingsPayload = {
        ...form,
        prefix: form.prefix || null,
        modRoleId: form.modRoleId || null,
        adminRoleId: form.adminRoleId || null,
        modLogChannelId: form.modLogChannelId || null,
        muteRoleId: form.muteRoleId || null,
      };
      const res = await setGuildSettings(guildId, normalized);
      if (!res.ok) {
        setError(res.error ?? "Save failed");
        return;
      }
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
      <Card>
        <CardHeader>
          <div>
            <CardTitle>General settings</CardTitle>
            <CardDescription>Core server configuration — Guild model.</CardDescription>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prefix">Command prefix</Label>
            <Input
              id="prefix"
              maxLength={5}
              placeholder="(uses global default)"
              value={form.prefix ?? ""}
              onChange={(e) => field("prefix", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="locale">Locale</Label>
            <Input
              id="locale"
              value={form.locale ?? ""}
              onChange={(e) => field("locale", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={form.timezone ?? ""}
              onChange={(e) => field("timezone", e.target.value)}
            />
          </div>
          <div />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modRoleId">Mod role ID</Label>
            <Input
              id="modRoleId"
              placeholder="Role ID"
              value={form.modRoleId ?? ""}
              onChange={(e) => field("modRoleId", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminRoleId">Admin role ID</Label>
            <Input
              id="adminRoleId"
              placeholder="Role ID"
              value={form.adminRoleId ?? ""}
              onChange={(e) => field("adminRoleId", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="muteRoleId">Mute role ID</Label>
            <Input
              id="muteRoleId"
              placeholder="Role ID"
              value={form.muteRoleId ?? ""}
              onChange={(e) => field("muteRoleId", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modLogChannelId">Mod log channel ID</Label>
            <Input
              id="modLogChannelId"
              placeholder="Channel ID"
              value={form.modLogChannelId ?? ""}
              onChange={(e) => field("modLogChannelId", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noMentionSpamLimit">No-mention-spam limit</Label>
            <Input
              id="noMentionSpamLimit"
              type="number"
              placeholder="Disabled"
              value={form.noMentionSpamLimit ?? ""}
              onChange={(e) =>
                field(
                  "noMentionSpamLimit",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noMentionSpamWindowMs">No-mention-spam window (ms)</Label>
            <Input
              id="noMentionSpamWindowMs"
              type="number"
              placeholder="Disabled"
              value={form.noMentionSpamWindowMs ?? ""}
              onChange={(e) =>
                field(
                  "noMentionSpamWindowMs",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </div>
        </div>
      </Card>
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
