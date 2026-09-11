import { Utility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import { container, type Piece } from "@sapphire/framework";
import type {
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
} from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import { acquireRedisLock } from "#lib/redis-lock.js";
import { ModuleName, ReactionRoleKeys } from "../keys.js";
import {
  deleteMenu,
  findMenuByMessage,
  getMenu,
  listMenus,
  maxOptionsForMode,
  normalizeMenuId,
  resolveMenuId,
  saveMenu,
  trackMenuMessage,
  validateMenuDraft,
  validateOptionDraft,
  type ReactionRoleMenu,
  type ReactionRoleMode,
  type ReactionRoleOption,
} from "../data.js";
import { reactionRoleRegistry } from "../registry.js";
import { buildMenuCard } from "../lib/menu-card.js";
import {
  applyOptionToggle,
  applySelectToggle,
  type RoleToggleResult,
} from "../lib/role-toggle.js";
import { getMaxMenus } from "../index.js";
import { clampMessageDocumentV2, type MessageDocumentV2 } from "@lumi/contracts";

export type { RoleToggleResult };
export type { ReactionRoleMenu, ReactionRoleMode, ReactionRoleOption };

/** Thrown when a menu write can't get the per-menu lock before another staff member's edit finishes. */
export class ReactionRoleMenuLockedError extends Error {
  public constructor() {
    super("Someone else is editing this menu right now — try again in a moment.");
    this.name = "ReactionRoleMenuLockedError";
  }
}

@ApplyOptions<Piece.Options>({ name: "reactionroles" })
export default class ReactionRolesUtility extends Utility {
  public get moduleName() {
    return ModuleName;
  }

  private async withMenuLock<T>(
    guildId: string,
    menuId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    let lock;
    try {
      lock = await acquireRedisLock(
        container.redis,
        ReactionRoleKeys.menuWrite(guildId, menuId),
      );
    } catch {
      throw new ReactionRoleMenuLockedError();
    }
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  public async listMenus(guildId: string): Promise<ReactionRoleMenu[]> {
    return listMenus(guildId);
  }

  public async getMenu(
    guildId: string,
    menuId: string,
  ): Promise<ReactionRoleMenu | null> {
    return reactionRoleRegistry.getMenu(guildId, menuId);
  }

  public async createMenu(
    guildId: string,
    input: {
      title: string;
      description?: string | null;
      color?: string | null;
      mode?: ReactionRoleMode;
      exclusive?: boolean;
      maxRoles?: number;
      richContent?: MessageDocumentV2;
    },
  ): Promise<ReactionRoleMenu> {
    const errors = validateMenuDraft({
      title: input.title,
      description: input.description,
      color: input.color,
      mode: input.mode ?? "buttons",
      maxRoles: input.maxRoles ?? 1,
    });
    if (errors.length > 0) throw new Error(errors[0]!.message);
    const menus = await listMenus(guildId);
    const maxMenus = await getMaxMenus(guildId);
    if (menus.length >= maxMenus) {
      throw new Error(`This server already has the maximum of ${maxMenus} role menus.`);
    }
    const id = await resolveMenuId(guildId, input.title);
    const now = Date.now();
    const menu = await saveMenu({
      id,
      guildId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      color: input.color?.trim() || null,
      mode: input.mode ?? "buttons",
      exclusive: input.exclusive ?? false,
      maxRoles: input.maxRoles ?? 1,
      channelId: null,
      messageIds: [],
      options: [],
      richContent: clampMessageDocumentV2(input.richContent),
      createdAt: now,
      updatedAt: now,
    });
    await reactionRoleRegistry.invalidateMenus(guildId);
    return menu;
  }

  public async updateMenu(
    guildId: string,
    menuId: string,
    patch: {
      title?: string;
      description?: string | null;
      color?: string | null;
      mode?: ReactionRoleMode;
      exclusive?: boolean;
      maxRoles?: number;
      richContent?: MessageDocumentV2;
    },
  ): Promise<ReactionRoleMenu> {
    return this.withMenuLock(guildId, menuId, async () => {
      const existing = await getMenu(guildId, menuId);
      if (!existing) throw new Error("That role menu no longer exists.");
      const next: ReactionRoleMenu = {
        ...existing,
        title: patch.title?.trim() || existing.title,
        description:
          patch.description === undefined ? existing.description : patch.description?.trim() || null,
        color: patch.color === undefined ? existing.color : patch.color?.trim() || null,
        mode: patch.mode ?? existing.mode,
        exclusive: patch.exclusive ?? existing.exclusive,
        maxRoles: patch.maxRoles ?? existing.maxRoles,
        richContent:
          patch.richContent === undefined
            ? existing.richContent
            : clampMessageDocumentV2(patch.richContent),
      };
      const errors = validateMenuDraft({
        title: next.title,
        description: next.description,
        color: next.color,
        mode: next.mode,
        maxRoles: next.maxRoles,
      });
      if (errors.length > 0) throw new Error(errors[0]!.message);
      const cap = maxOptionsForMode(next.mode);
      if (next.options.length > cap) {
        throw new Error(
          `${next.mode === "select" ? "Dropdown" : next.mode === "reactions" ? "Reaction" : "Button"} menus hold at most ${cap} options — remove ${next.options.length - cap} first.`,
        );
      }
      if (next.exclusive) next.maxRoles = 1;
      const saved = await saveMenu(next);
      await reactionRoleRegistry.invalidateMenus(guildId);
      return saved;
    });
  }

  public async deleteMenu(guildId: string, menuId: string): Promise<boolean> {
    return this.withMenuLock(guildId, menuId, async () => {
      const removed = await deleteMenu(guildId, menuId);
      if (removed) await reactionRoleRegistry.invalidateMenus(guildId);
      return removed;
    });
  }

  public async addOption(
    guildId: string,
    menuId: string,
    input: {
      label: string;
      emoji?: string | null;
      description?: string | null;
      roleId: string;
      requiredRoleId?: string | null;
    },
  ): Promise<ReactionRoleMenu> {
    return this.withMenuLock(guildId, menuId, async () => {
      const menu = await getMenu(guildId, menuId);
      if (!menu) throw new Error("That role menu no longer exists.");
      const errors = validateOptionDraft(input);
      if (errors.length > 0) throw new Error(errors[0]!.message);
      if (menu.options.length >= maxOptionsForMode(menu.mode)) {
        throw new Error(
          `This menu already has the maximum of ${maxOptionsForMode(menu.mode)} options for ${menu.mode} mode.`,
        );
      }
      if (menu.options.some((o) => o.roleId === input.roleId)) {
        throw new Error("That role is already an option on this menu.");
      }
      const id = this.resolveOptionId(menu, input.label);
      const option: ReactionRoleOption = {
        id,
        label: input.label.trim(),
        emoji: input.emoji?.trim() || null,
        description: input.description?.trim() || null,
        roleId: input.roleId,
        requiredRoleId: input.requiredRoleId?.trim() || null,
      };
      const saved = await saveMenu({ ...menu, options: [...menu.options, option] });
      await reactionRoleRegistry.invalidateMenus(guildId);
      return saved;
    });
  }

  public async editOption(
    guildId: string,
    menuId: string,
    optionId: string,
    input: {
      label: string;
      emoji?: string | null;
      description?: string | null;
      roleId: string;
      requiredRoleId?: string | null;
    },
  ): Promise<ReactionRoleMenu> {
    return this.withMenuLock(guildId, menuId, async () => {
      const menu = await getMenu(guildId, menuId);
      if (!menu) throw new Error("That role menu no longer exists.");
      const index = menu.options.findIndex((o) => o.id === optionId);
      if (index === -1) throw new Error("That option no longer exists on this menu.");
      const errors = validateOptionDraft(input);
      if (errors.length > 0) throw new Error(errors[0]!.message);
      if (
        menu.options.some((o, i) => i !== index && o.roleId === input.roleId)
      ) {
        throw new Error("That role is already another option on this menu.");
      }
      const options = [...menu.options];
      options[index] = {
        id: optionId,
        label: input.label.trim(),
        emoji: input.emoji?.trim() || null,
        description: input.description?.trim() || null,
        roleId: input.roleId,
        requiredRoleId: input.requiredRoleId?.trim() || null,
      };
      const saved = await saveMenu({ ...menu, options });
      await reactionRoleRegistry.invalidateMenus(guildId);
      return saved;
    });
  }

  public async removeOption(
    guildId: string,
    menuId: string,
    optionId: string,
  ): Promise<ReactionRoleMenu> {
    return this.withMenuLock(guildId, menuId, async () => {
      const menu = await getMenu(guildId, menuId);
      if (!menu) throw new Error("That role menu no longer exists.");
      if (!menu.options.some((o) => o.id === optionId)) {
        throw new Error("That option no longer exists on this menu.");
      }
      const saved = await saveMenu({
        ...menu,
        options: menu.options.filter((o) => o.id !== optionId),
      });
      await reactionRoleRegistry.invalidateMenus(guildId);
      return saved;
    });
  }

  public async postMenu(
    guild: Guild,
    channel: GuildTextBasedChannel,
    menuId: string,
  ): Promise<{ menu: ReactionRoleMenu; message: Message }> {
    const menu = await getMenu(guild.id, menuId);
    if (!menu) throw new Error("That role menu no longer exists.");
    if (menu.options.length === 0) {
      throw new Error("Add at least one option before posting this menu.");
    }
    const message = await channel.send(buildMenuCard(menu));
    if (menu.mode === "reactions") {
      for (const option of menu.options) {
        if (!option.emoji) continue;
        await message.react(option.emoji).catch((err: unknown) => {
          logError(`ReactionRoles: seed reaction failed for ${menu.id}`, err);
        });
      }
    }
    const next = await this.withMenuLock(guild.id, menuId, async () => {
      const fresh = (await getMenu(guild.id, menuId)) ?? menu;
      const tracked = await trackMenuMessage(fresh, channel.id, message.id);
      await reactionRoleRegistry.invalidateMenus(guild.id);
      return tracked;
    });
    return { menu: next, message };
  }

  public async toggleOption(
    guild: Guild,
    member: GuildMember,
    menuId: string,
    optionId: string,
  ): Promise<RoleToggleResult> {
    const menu = await this.getMenu(guild.id, menuId);
    if (!menu) {
      return {
        plan: { outcome: "blocked", reason: "unknownOption", roleId: null },
        applied: false,
        message: "That role menu no longer exists.",
      };
    }
    return applyOptionToggle(guild, member, menu, optionId);
  }

  public async toggleSelect(
    guild: Guild,
    member: GuildMember,
    menuId: string,
    optionIds: string[],
  ): Promise<RoleToggleResult[]> {
    const menu = await this.getMenu(guild.id, menuId);
    if (!menu) {
      return [
        {
          plan: { outcome: "blocked", reason: "unknownOption", roleId: null },
          applied: false,
          message: "That role menu no longer exists.",
        },
      ];
    }
    return applySelectToggle(guild, member, menu, optionIds);
  }

  public async findMenuByMessage(
    guildId: string,
    messageId: string,
  ): Promise<ReactionRoleMenu | null> {
    const viaRegistry = await reactionRoleRegistry.findMenuByMessage(guildId, messageId);
    if (viaRegistry) return viaRegistry;
    return findMenuByMessage(guildId, messageId);
  }

  public async optionIdForEmoji(
    guildId: string,
    menuId: string,
    emojiId: string | null,
    emojiName: string | null,
  ): Promise<string | null> {
    const menu = await this.getMenu(guildId, menuId);
    if (!menu) return null;
    for (const option of menu.options) {
      if (!option.emoji) continue;
      const trimmed = option.emoji.trim();
      const custom = /^<a?:([a-zA-Z0-9_]+):(\d+)>$/.exec(trimmed);
      if (custom) {
        if (custom[2] === emojiId) return option.id;
        continue;
      }
      if (emojiId === null && trimmed === emojiName) return option.id;
    }
    return null;
  }

  private resolveOptionId(menu: ReactionRoleMenu, label: string): string {
    const base = normalizeMenuId(label);
    const taken = new Set(menu.options.map((o) => o.id));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base}-${n}`.slice(0, 32);
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`.slice(0, 32);
  }
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    reactionroles: ReactionRolesUtility;
  }
}
