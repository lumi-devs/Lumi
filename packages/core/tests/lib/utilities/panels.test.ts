import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
} from "@discordjs/builders";
import { ButtonStyle, ChannelType } from "discord.js";
import { container } from "@sapphire/framework";
import {
  createUserSelectMenu,
  createRoleSelectMenu,
  createChannelSelectMenu,
  createMentionableSelectMenu,
  createStringSelectMenu,
  createBackButton,
  createActionButton,
  createPaginationRow,
  buildSafeActionRows,
  formatBreadcrumbHeader,
  createCategorySubmenuRow,
} from "#utilities/panels.js";
import {
  CARD_ACCENTS,
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
  makeCard,
  makeListCard,
  formatStatusBadge,
  formatSubtitle,
  formatBreadcrumbs,
} from "#utilities/cards.js";
import { BotConfig } from "#utilities/config.js";
import { createStringSelectMenu as createStringSelectFromIndex } from "#utilities/index.js";

describe("Panel & Card Utility Standardization", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.restoreAllMocks();
  });

  describe("Select Menu Builders", () => {
    it("createUserSelectMenu creates user select menu with expected options", () => {
      const menu = createUserSelectMenu({
        customId: "user_select_test",
        placeholder: "Select a user...",
        minValues: 1,
        maxValues: 3,
        disabled: false,
      });
      const data = menu.toJSON();
      expect(data.custom_id).toBe("user_select_test");
      expect(data.placeholder).toBe("Select a user...");
      expect(data.min_values).toBe(1);
      expect(data.max_values).toBe(3);
      expect(data.disabled).toBe(false);
    });

    it("createRoleSelectMenu creates role select menu with expected options", () => {
      const menu = createRoleSelectMenu({
        customId: "role_select_test",
        placeholder: "Select a role...",
        minValues: 1,
        maxValues: 2,
        disabled: true,
      });
      const data = menu.toJSON();
      expect(data.custom_id).toBe("role_select_test");
      expect(data.placeholder).toBe("Select a role...");
      expect(data.min_values).toBe(1);
      expect(data.max_values).toBe(2);
      expect(data.disabled).toBe(true);
    });

    it("createChannelSelectMenu creates channel select menu with channelTypes", () => {
      const menu = createChannelSelectMenu({
        customId: "channel_select_test",
        placeholder: "Select a channel...",
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        minValues: 1,
        maxValues: 5,
      });
      const data = menu.toJSON();
      expect(data.custom_id).toBe("channel_select_test");
      expect(data.placeholder).toBe("Select a channel...");
      expect(data.channel_types).toEqual([
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
      ]);
    });

    it("createMentionableSelectMenu creates mentionable select menu with expected options", () => {
      const menu = createMentionableSelectMenu({
        customId: "mentionable_select_test",
        placeholder: "Select a user or role...",
        minValues: 1,
        maxValues: 4,
        disabled: true,
      });
      const data = menu.toJSON();
      expect(data.custom_id).toBe("mentionable_select_test");
      expect(data.placeholder).toBe("Select a user or role...");
      expect(data.min_values).toBe(1);
      expect(data.max_values).toBe(4);
      expect(data.disabled).toBe(true);
    });

    it("createStringSelectMenu builds options properly", () => {
      const menu = createStringSelectMenu({
        customId: "string_select_test",
        placeholder: "Choose an option...",
        options: [
          { label: "Option 1", value: "opt1", description: "Desc 1", emoji: "⚙️" },
          { label: "Option 2", value: "opt2", default: true },
        ],
      });
      const data = menu.toJSON();
      expect(data.custom_id).toBe("string_select_test");
      expect(data.options).toHaveLength(2);
      expect(data.options[0]?.label).toBe("Option 1");
      expect(data.options[0]?.value).toBe("opt1");
      expect(data.options[0]?.description).toBe("Desc 1");
      expect(data.options[1]?.default).toBe(true);
    });

    it("exports utilities cleanly via index.ts", () => {
      expect(typeof createStringSelectFromIndex).toBe("function");
    });
  });

  describe("Submenu & Breadcrumb Builders", () => {
    it("formatBreadcrumbHeader builds active path string", () => {
      const header = formatBreadcrumbHeader(["Settings", "Modules", "Moderation"]);
      expect(header).toBe("Settings ❯ Modules ❯ **Moderation**");
    });

    it("createCategorySubmenuRow generates category selection menu", () => {
      const row = createCategorySubmenuRow("submenu_test", [
        { id: "all", label: "All Modules", count: 12, emoji: "📦" },
        { id: "mod", label: "Moderation", count: 4, emoji: "🛡️" },
      ], "mod");
      const data = row.toJSON();
      expect(data.components[0].custom_id).toBe("submenu_test");
      expect(data.components[0].options[1].default).toBe(true);
      expect(data.components[0].options[0].label).toBe("All Modules (12)");
    });
  });

  describe("Panel Buttons & Navigation Helpers", () => {
    it("createBackButton creates secondary button with default label '← Back'", () => {
      const btn = createBackButton("back_btn");
      const data = btn.toJSON();
      expect(data.custom_id).toBe("back_btn");
      expect(data.label).toBe("← Back");
      expect(data.style).toBe(ButtonStyle.Secondary);
    });

    it("createBackButton accepts custom label", () => {
      const btn = createBackButton("back_btn_custom", "Go Back");
      expect(btn.toJSON().label).toBe("Go Back");
    });

    it("createActionButton creates primary action button with emoji and options", () => {
      const btn = createActionButton({
        customId: "action_test",
        label: "Confirm",
        style: ButtonStyle.Success,
        emoji: "✅",
        disabled: false,
      });
      const data = btn.toJSON();
      expect(data.custom_id).toBe("action_test");
      expect(data.label).toBe("Confirm");
      expect(data.style).toBe(ButtonStyle.Success);
      expect(data.emoji?.name).toBe("✅");
    });

    it("createPaginationRow generates prev, indicator, and next buttons", () => {
      const row = createPaginationRow({
        customIdPrefix: "nav",
        currentPage: 0,
        totalPages: 3,
      });
      const components = row.components;
      expect(components).toHaveLength(3);

      const prev = components[0]?.toJSON();
      const indicator = components[1]?.toJSON();
      const next = components[2]?.toJSON();

      expect(prev?.custom_id).toBe("nav:prev:0");
      expect(prev?.disabled).toBe(true); // First page disabled

      expect(indicator?.label).toBe("1 / 3");
      expect(indicator?.disabled).toBe(true);

      expect(next?.custom_id).toBe("nav:next:1");
      expect(next?.disabled).toBe(false);
    });
  });

  describe("ActionRow Safety Utility", () => {
    it("returns up to 5 action rows unchanged", () => {
      const rows = Array.from({ length: 4 }, () => new ActionRowBuilder());
      const safe = buildSafeActionRows(rows);
      expect(safe).toHaveLength(4);
      expect(container.logger.warn).not.toHaveBeenCalled();
    });

    it("truncates rows > 5 and logs a warning", () => {
      const rows = Array.from({ length: 7 }, () => new ActionRowBuilder());
      const safe = buildSafeActionRows(rows);
      expect(safe).toHaveLength(5);
      expect(container.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[PanelSafety] ActionRow limit exceeded (7 > 5)"),
      );
    });
  });

  describe("Card Extensions & Formatting Helpers", () => {
    it("CARD_ACCENTS palette is defined", () => {
      expect(CARD_ACCENTS.PRIMARY).toBe(0x5865f2);
      expect(CARD_ACCENTS.SUCCESS).toBe(0x2ecc71);
      expect(CARD_ACCENTS.ERROR).toBe(0xe74c3c);
      expect(CARD_ACCENTS.WARNING).toBe(0xf1c40f);
      expect(CARD_ACCENTS.INFO).toBe(0x3498db);
    });

    it("makeSuccessCard sets accent color", () => {
      const card = makeSuccessCard("Success Title", "Success Body");
      const container = card.components[0] as ContainerBuilder;
      const data = container.toJSON() as { accent_color?: number };
      expect(data.accent_color).toBe(BotConfig.branding.colors.SUCCESS);
    });

    it("formatStatusBadge formats status strings properly", () => {
      expect(formatStatusBadge("online")).toBe("🟢 `ONLINE`");
      expect(formatStatusBadge("dnd")).toBe("🔴 `DND`");
      expect(formatStatusBadge("active", "Active Node")).toBe("🟢 `Active Node`");
    });

    it("formatSubtitle formats subtext markdown", () => {
      expect(formatSubtitle("System Overview")).toBe("-# System Overview");
      expect(formatSubtitle("Details", "📌")).toBe("-# 📌 Details");
    });

    it("formatBreadcrumbs formats panel navigation path", () => {
      expect(formatBreadcrumbs(["Settings", "Security", "2FA"])).toBe(
        "Settings ❯ Security ❯ **2FA**",
      );
    });
  });
});
