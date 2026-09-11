import type {
  PreviewButton,
  PreviewContainer,
} from "#/components/guild/discord-message-preview";

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
  const body = [
    draft.description.trim() || "Pick your roles below.",
    ...filled.map((o) => {
      const emoji = o.emoji.trim() ? `${o.emoji.trim()} ` : "";
      return `${emoji}**${o.label.trim()}** → @${o.role.trim() || o.label.trim()}`;
    }),
    draft.mode === "reactions"
      ? "-# React to this message to claim a role. Remove your reaction to give it back."
      : "-# This is what members see once the menu is posted.",
  ];

  const container: PreviewContainer = {
    accentColor: draft.color?.trim() || "#5865f2",
    components: [
      { kind: "text", content: `## 🎭 ${draft.title.trim() || "Role menu"}` },
      { kind: "separator", divider: true },
      ...body
        .filter((line) => line.trim().length > 0)
        .map((content) => ({ kind: "text" as const, content })),
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
