"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input, Select } from "#/components/ui/input";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

const actionOptions = ["Ban", "Kick", "Timeout", "Warn"] as const;

export function ModerationPreviewCard() {
  const [action, setAction] = useState<(typeof actionOptions)[number]>("Ban");
  const [reason, setReason] = useState("Spamming scam links in #general");
  const [target, setTarget] = useState("river_dev");

  const caseCard: PreviewEmbed = {
    accentColor: "#4c6ef5",
    title: "Case #1042",
    body: [
      `**Action:** ${action}\n**Target:** @${target || "river_dev"}\n**Moderator:** @mod-alex\n**Reason:** ${reason || "—"}\n**Date:** <t:1735689600:R>`,
    ],
    footer: "Appeal with /appeal — revoking the case here does not undo the action.",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          A sample case card, shaped exactly like the bot&apos;s case log
          output.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Action" htmlFor="mod-preview-action">
          <Select
            id="mod-preview-action"
            value={action}
            onChange={(e) =>
              setAction(e.target.value as (typeof actionOptions)[number])
            }
          >
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target" htmlFor="mod-preview-target">
          <Input
            id="mod-preview-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="river_dev"
            spellCheck={false}
          />
        </Field>
        <Field label="Reason" htmlFor="mod-preview-reason">
          <Input
            id="mod-preview-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spamming scam links in #general"
            spellCheck={false}
          />
        </Field>
      </div>
      <DiscordMessagePreview
        channelName="mod-log"
        channelTopic="Moderator actions land here"
        body={`Successfully banned **@${target || "river_dev"}**.\n\n**Case:** #1042\n**Reason:** ${reason || "—"}`}
      />
      <DiscordMessagePreview channelName="mod-log" embed={caseCard} />
    </div>
  );
}
