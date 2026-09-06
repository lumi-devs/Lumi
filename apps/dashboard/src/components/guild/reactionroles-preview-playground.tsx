"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input, Select, Textarea } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import {
  DiscordMessagePreview,
  type PreviewButton,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

type PlaygroundMode = "buttons" | "select" | "reactions";

interface PlaygroundOption {
  key: number;
  label: string;
  emoji: string;
  role: string;
}

let optionKey = 1;
function blankOption(label: string, emoji: string, role: string): PlaygroundOption {
  return { key: optionKey++, label, emoji, role };
}

function modeHint(mode: PlaygroundMode): string {
  if (mode === "buttons") return "Buttons — members tap to toggle, up to 20 options.";
  if (mode === "select") return "Dropdown — members multi-pick, up to 25 options.";
  return "Reactions — members react to claim, up to 20 options.";
}

export function ReactionRolesPreviewPlayground() {
  const [title, setTitle] = useState("Game night roles");
  const [description, setDescription] = useState(
    "Pick the squads you play with — change them anytime.",
  );
  const [mode, setMode] = useState<PlaygroundMode>("buttons");
  const [options, setOptions] = useState<PlaygroundOption[]>([
    blankOption("Valorant", "🔫", "Valorant"),
    blankOption("Minecraft", "⛏️", "Minecraft"),
    blankOption("Movie night", "🎬", "Movie Night"),
  ]);

  function patchOption(key: number, patch: Partial<PlaygroundOption>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  const filled = options.filter((o) => o.label.trim().length > 0);
  const body = [
    description.trim() || "Pick your roles below.",
    "",
    ...filled.map((o) => {
      const emoji = o.emoji.trim() ? `${o.emoji.trim()} ` : "";
      if (mode === "reactions") return `${emoji}**${o.label.trim()}** → @${o.role.trim() || o.label.trim()}`;
      return `${emoji}**${o.label.trim()}** → @${o.role.trim() || o.label.trim()}`;
    }),
    "",
    mode === "reactions"
      ? "-# React to this message to claim a role. Remove your reaction to give it back."
      : "-# This is what members see once the menu is posted.",
  ];

  const embed: PreviewEmbed = {
    accentColor: "#5865f2",
    title: `🎭 ${title.trim() || "Role menu"}`,
    body,
    footer:
      mode === "buttons" ? "Buttons · Up to 2" : mode === "select" ? "Dropdown · Up to 2" : "Reactions",
  };

  const buttons: PreviewButton[] | undefined =
    mode === "buttons"
      ? filled.slice(0, 20).map((o) => ({
          label: o.label.trim(),
          style: "secondary" as const,
          emoji: o.emoji.trim() || undefined,
        }))
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          Draft a menu and watch the exact card members see update instantly.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Title" htmlFor="rr-preview-title">
            <Input
              id="rr-preview-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Game night roles"
              spellCheck={false}
            />
          </Field>
          <Field label="Description" htmlFor="rr-preview-description">
            <Textarea
              id="rr-preview-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pick the squads you play with."
            ></Textarea>
          </Field>
          <Field label="Mode" htmlFor="rr-preview-mode">
            <Select
              id="rr-preview-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as PlaygroundMode)}
            >
              <option value="buttons">Buttons</option>
              <option value="select">Dropdown</option>
              <option value="reactions">Reactions</option>
            </Select>
          </Field>
          <p className="text-[13px] text-fg-subtle">{modeHint(mode)}</p>
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-fg">Options</span>
            {options.map((option, index) => (
              <div key={option.key} className="flex items-center gap-2">
                <Field label={`Option ${index + 1} emoji`} htmlFor={`rr-preview-emoji-${option.key}`} className="w-20 gap-1">
                  <Input
                    id={`rr-preview-emoji-${option.key}`}
                    value={option.emoji}
                    onChange={(e) => patchOption(option.key, { emoji: e.target.value })}
                    placeholder="🔫"
                    spellCheck={false}
                  />
                </Field>
                <Field label={`Option ${index + 1} label`} htmlFor={`rr-preview-label-${option.key}`} className="flex-1 gap-1">
                  <Input
                    id={`rr-preview-label-${option.key}`}
                    value={option.label}
                    onChange={(e) => patchOption(option.key, { label: e.target.value })}
                    placeholder="Valorant"
                    spellCheck={false}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove option ${index + 1}`}
                  disabled={options.length <= 1}
                  onClick={() =>
                    setOptions((prev) => prev.filter((o) => o.key !== option.key))
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              disabled={options.length >= 5}
              onClick={() =>
                setOptions((prev) => [...prev, blankOption("", "⭐", "")])
              }
            >
              Add option
            </Button>
          </div>
        </div>
        <DiscordMessagePreview
          channelName="role-menu"
          channelTopic="Claim your roles"
          embed={embed}
          selectPlaceholder={mode === "select" ? "Choose your roles…" : undefined}
          buttons={buttons}
        />
      </div>
    </div>
  );
}
