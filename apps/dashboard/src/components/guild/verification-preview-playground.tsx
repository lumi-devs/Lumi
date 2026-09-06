"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input, Textarea } from "#/components/ui/input";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

export function VerificationPreviewPlayground() {
  const [title, setTitle] = useState("✅ Verify to join the server");
  const [intro, setIntro] = useState(
    "Welcome, @new-member! Click **Verify** below and tap the emoji in the order shown to get the @Member role and unlock the rest of the server.",
  );
  const [footer, setFooter] = useState(
    "Having trouble? Ask a moderator in #support.",
  );

  const panel: PreviewEmbed = {
    accentColor: "#12b886",
    title,
    body: [intro],
    footer,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          Draft the welcome + verification copy here, then paste the final
          wording into the panel setup.
        </p>
      </div>
      <Field label="Panel title" htmlFor="verify-preview-title">
        <Input
          id="verify-preview-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="✅ Verify to join the server"
          spellCheck={false}
        />
      </Field>
      <Field label="Welcome text" htmlFor="verify-preview-intro">
        <Textarea
          id="verify-preview-intro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={3}
          spellCheck={false}
        />
      </Field>
      <Field label="Footer note" htmlFor="verify-preview-footer">
        <Input
          id="verify-preview-footer"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          spellCheck={false}
        />
      </Field>
      <DiscordMessagePreview
        channelName="verify-here"
        channelTopic="Read this first, then verify"
        body="Welcome! Please verify to see the rest of the server."
        embed={panel}
        buttons={[{ label: "✅ Verify", style: "success" }]}
      />
    </div>
  );
}
