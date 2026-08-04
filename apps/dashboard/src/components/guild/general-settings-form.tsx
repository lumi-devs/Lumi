"use client";

import { useState } from "react";
import type { GuildSettingsPayload } from "@lumi/contracts";
import { setGuildSettings } from "#/actions/guild-actions";
import { SaveBar } from "#/components/save-bar";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Input, Label } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { GuildSettings } from "#/lib/dashboard-data";

type FormState = GuildSettingsPayload;

// These fields render as text inputs where an empty string means "unset";
// every other field's own `field()` setter already produces the right
// wire value (e.g. numeric fields go straight to number | null).
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

/** dashboard.md §9B `GuildGeneralSettingsCard` — Guild model fields. */
export function GeneralSettingsForm({
  guildId,
  settings,
}: {
  guildId: string;
  settings: GuildSettings;
}) {
  const baseline = toFormState(settings);
  const [form, setForm] = useState<FormState>(baseline);
  const { isPending, error, setError, run } = useServerAction();

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    run(async () => {
      // guild.settings.set is a partial update (see GuildSettingsPayload's
      // doc comment) - send only what actually changed. Sending the whole
      // cached `form` here would silently revert any concurrent change
      // (another tab, another admin, a Discord slash command) made to a
      // field this session never touched, since every field is optional in
      // the wire contract but this component used to fill them all in.
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
      if (!res.ok) setError(res.error ?? "Save failed");
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
        onReset={() => setForm(baseline)}
      />
    </>
  );
}
