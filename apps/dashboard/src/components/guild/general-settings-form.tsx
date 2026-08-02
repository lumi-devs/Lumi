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
      const normalized: GuildSettingsPayload = {
        ...form,
        prefix: form.prefix || null,
        modRoleId: form.modRoleId || null,
        adminRoleId: form.adminRoleId || null,
        modLogChannelId: form.modLogChannelId || null,
        muteRoleId: form.muteRoleId || null,
      };
      const res = await setGuildSettings(guildId, normalized);
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
