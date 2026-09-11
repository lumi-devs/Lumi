"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input, Textarea } from "#/components/ui/input";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

export function VerificationPreviewPlayground({
  initialTitle,
  initialWelcome,
  initialFooter,
}: {
  initialTitle?: string;
  initialWelcome?: string;
  initialFooter?: string;
}) {
  const [title, setTitle] = useState(
    initialTitle || "✅ Verify to join the server",
  );
  const [intro, setIntro] = useState(
    initialWelcome ||
      "Welcome, @new-member! Click **Verify** below and tap the emoji in the order shown to get the @Member role and unlock the rest of the server.",
  );
  const [footer, setFooter] = useState(
    initialFooter || "Having trouble? Ask a moderator in #support.",
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
        <Badge variant="neutral">Preview only — edits here don&rsquo;t save</Badge>
        <p className="text-[13px] text-fg-subtle">
          Draft the wording here, then set it for real in the Panel Content
          fields above. That&rsquo;s what actually gets posted.
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
