"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input } from "#/components/ui/input";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

const placeholderPattern =
  /\{\}|\{number\}|\{position\}|\{username\}|\{name\}|\{nickname\}/;

/** Mirrors the worker's generator-name template syntax (`{}`/`{number}` sequence
 *  number, `{position}` alias, `{username}`, `{name}`/`{nickname}` display name;
 *  number appended when no placeholder is present; truncated to 100 characters). */
export function resolvePreviewName(
  template: string,
  options: { number: number; username: string; displayName: string },
): string {
  const trimmed = template.trim();
  const substituted = placeholderPattern.test(trimmed)
    ? trimmed
        .replaceAll("{}", String(options.number))
        .replaceAll("{number}", String(options.number))
        .replaceAll("{position}", String(options.number))
        .replaceAll("{username}", options.username)
        .replaceAll("{name}", options.displayName)
        .replaceAll("{nickname}", options.displayName)
    : `${trimmed} ${options.number}`;
  return [...substituted].slice(0, 100).join("");
}

const sampleUsername = "alex";
const sampleDisplayName = "Alex";
const sampleNumber = 3;

export function TempVcPreviewPlayground({
  defaultTemplate,
}: {
  defaultTemplate?: string;
}) {
  const [template, setTemplate] = useState(
    defaultTemplate ?? "{username}'s lounge",
  );
  const resolved = resolvePreviewName(template, {
    number: sampleNumber,
    username: sampleUsername,
    displayName: sampleDisplayName,
  });

  const panelEmbed: PreviewEmbed = {
    accentColor: "#4c6ef5",
    title: "🔊 Voice Channel Controls",
    body: [
      `**Channel:** #${resolved}\n**Owner:** @Alex\n**Limit:** \`Unlimited\`\n**Status:** \`UNLOCKED\` · \`VISIBLE\``,
    ],
    footer: "Settings are restricted to the owner. Anyone can claim if the owner leaves.",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          Placeholders: {"{}"}, {"{number}"}, {"{position}"}, {"{username}"},{" "}
          {"{name}"}/{"{nickname}"}. Sample member: Alex, channel #
          {sampleNumber}.
        </p>
      </div>
      <Field label="Channel name template" htmlFor="tempvc-preview-template">
        <Input
          id="tempvc-preview-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="{username}'s lounge"
          spellCheck={false}
        />
      </Field>
      <DiscordMessagePreview
        channelName="voice-setup"
        channelTopic="Join a generator to get your own channel"
        voiceRows={[
          { name: "➕ Join to create", memberCount: 0 },
          {
            name: resolved,
            memberCount: 2,
            members: ["Alex", "Sam"],
          },
        ]}
        body={`Created **${resolved}** for @Alex — this is what members see when the generator fires.`}
        embed={panelEmbed}
        selectPlaceholder="Manage Channel…"
        buttons={[{ label: "🎯 Claim Ownership", style: "primary" }]}
      />
    </div>
  );
}
