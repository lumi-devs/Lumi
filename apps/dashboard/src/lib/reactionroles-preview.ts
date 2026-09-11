import type { MessageDocumentV2 } from "@lumi/contracts";
import type {
  PreviewButton,
  PreviewContainer,
  PreviewV2Component,
} from "#/components/guild/discord-message-preview";
import { blockToPreview } from "#/components/guild/message-builder-v2";

export type MenuPreviewMode = "buttons" | "select" | "reactions";

export interface MenuPreviewOption {
  label: string;
  emoji: string;
  /** Role name as members will read it, not the snowflake. */
  role: string;
}

export interface MenuPreviewDraft {
  title: string;
  description: string;
  mode: MenuPreviewMode;
  options: MenuPreviewOption[];
  /** Hex accent, or empty for Discord's blurple. */
  color?: string;
  /** When it has blocks, replaces the title/description header — the
   * options list and mode footnote below always stay, matching the
   * worker's `buildMenuCard`. */
  richContent?: MessageDocumentV2;
}

export interface MenuPreview {
  container: PreviewContainer;
  buttons?: PreviewButton[];
  selectPlaceholder?: string;
}

/**
 * The card the bot posts for a reaction-role menu, built from an unsaved
 * draft. Mirrors `buildContainer()` in core — a Components V2 container with a
 * heading, divider, body and subtext footer, not an embed — so the dashboard
 * preview and the posted message stay the same shape.
 */
export function buildMenuPreview(draft: MenuPreviewDraft): MenuPreview {
  const filled = draft.options.filter((o) => o.label.trim().length > 0);
  const optionLines = filled.map((o) => {
    const emoji = o.emoji.trim() ? `${o.emoji.trim()} ` : "";
    return `${emoji}**${o.label.trim()}** → @${o.role.trim() || o.label.trim()}`;
  });

  const hasRichContent = (draft.richContent?.blocks.length ?? 0) > 0;
  const header: PreviewV2Component[] = hasRichContent
    ? draft.richContent!.blocks.map(blockToPreview)
    : [
        { kind: "text", content: `## 🎭 ${draft.title.trim() || "Role menu"}` },
        { kind: "separator", divider: true },
        { kind: "text", content: draft.description.trim() || "Pick your roles below." },
      ];

  const container: PreviewContainer = {
    accentColor: draft.color?.trim() || "#5865f2",
    components: [
      ...header,
      ...optionLines.map((content) => ({ kind: "text" as const, content })),
      draft.mode === "reactions"
        ? {
            kind: "text" as const,
            content: "-# React to this message to claim a role. Remove your reaction to give it back.",
          }
        : { kind: "text" as const, content: "-# This is what members see once the menu is posted." },
      { kind: "separator", divider: false },
      { kind: "text", content: `-# ${modeFootnote(draft.mode)}` },
    ],
  };

  return {
    container,
    buttons:
      draft.mode === "buttons"
        ? filled.slice(0, 20).map((o) => ({
            label: o.label.trim(),
            style: "secondary" as const,
            emoji: o.emoji.trim() || undefined,
          }))
        : undefined,
    selectPlaceholder: draft.mode === "select" ? "Choose your roles…" : undefined,
  };
}

function modeFootnote(mode: MenuPreviewMode): string {
  if (mode === "buttons") return "Buttons · Up to 20 options";
  if (mode === "select") return "Dropdown · Up to 25 options";
  return "Reactions · Up to 20 options";
}
