"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input } from "#/components/ui/input";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

export function AfkPreviewPlayground() {
  const [name, setName] = useState("Alex");
  const [reason, setReason] = useState("grabbing lunch, back soon");
  const [duration, setDuration] = useState("25 minutes");

  const notice: PreviewEmbed = {
    title: `💤 ${name || "Alex"} is AFK`,
    body: [`**Reason:** ${reason || "—"}\n**AFK for:** ${duration || "—"}`],
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          This is the notice other members see when they mention someone who is
          away.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Member" htmlFor="afk-preview-name">
          <Input
            id="afk-preview-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            spellCheck={false}
          />
        </Field>
        <Field label="AFK message" htmlFor="afk-preview-reason">
          <Input
            id="afk-preview-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="grabbing lunch, back soon"
            spellCheck={false}
          />
        </Field>
        <Field label="Away for" htmlFor="afk-preview-duration">
          <Input
            id="afk-preview-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="25 minutes"
            spellCheck={false}
          />
        </Field>
      </div>
      <DiscordMessagePreview
        channelName="general"
        body={`Hey @${name || "Alex"}, are you still here?`}
        username="Sam"
        roleColor="#e91e63"
        avatarColor="#e91e63"
        timestamp="Today at 4:21 PM"
        embed={notice}
      />
    </div>
  );
}
