import type {
  ReactionRoleMenu as MenuRow,
  ReactionRoleOption as OptionRow,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { clampMessageDocumentV2 } from "@lumi/contracts";
import type {
  ReactionRoleMenu,
  ReactionRoleMode,
  ReactionRoleOption,
} from "./reactionroles.js";

function toOption(row: OptionRow): ReactionRoleOption {
  return {
    id: row.slug,
    label: row.label,
    emoji: row.emoji,
    description: row.description,
    roleId: row.roleId,
    requiredRoleId: row.requiredRoleId,
  };
}

function toMenu(row: MenuRow, options: OptionRow[]): ReactionRoleMenu {
  return {
    id: row.id,
    guildId: row.guildId,
    title: row.title,
    description: row.description,
    color: row.color,
    mode: row.mode as ReactionRoleMode,
    exclusive: row.exclusive,
    maxRoles: row.maxRoles,
    channelId: row.channelId,
    messageIds: row.messageIds,
    options: options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toOption),
    richContent: clampMessageDocumentV2(row.richContent),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * `ReactionRoleMenu`/`ReactionRoleOption` (`reactionrole_menus`/`reactionrole_options`),
 * owned by the `reactionroles` module. Pure persistence - `reactionroles.ts` layers the
 * exported-shape mapping/validation, and `services/registry.ts` layers the per-guild L1
 * cache, on top of this.
 */
export class ReactionRoleRepository extends Repository {
  /**
   * Menu and its options are fetched as two queries rather than one `include`d query -
   * behaviorally identical against Postgres, but keeps every read path exercisable by
   * `tests/mocks/prisma.ts`, which has no relation-loading support.
   */
  private async attachOptions(menus: MenuRow[]): Promise<ReactionRoleMenu[]> {
    if (menus.length === 0) return [];
    const options = await this.prisma.reactionRoleOption.findMany({
      where: { menuId: { in: menus.map((m) => m.id) } },
    });
    const byMenu = new Map<string, OptionRow[]>();
    for (const option of options) {
      const bucket = byMenu.get(option.menuId);
      if (bucket) bucket.push(option);
      else byMenu.set(option.menuId, [option]);
    }
    return menus.map((menu) => toMenu(menu, byMenu.get(menu.id) ?? []));
  }

  public async listMenus(guildId: string): Promise<ReactionRoleMenu[]> {
    const rows = await this.prisma.reactionRoleMenu.findMany({ where: { guildId } });
    const menus = await this.attachOptions(rows);
    menus.sort((a, b) => a.title.localeCompare(b.title));
    return menus;
  }

  public async getMenu(guildId: string, menuId: string): Promise<ReactionRoleMenu | null> {
    const row = await this.prisma.reactionRoleMenu.findFirst({
      where: { id: menuId, guildId },
    });
    if (!row) return null;
    const [menu] = await this.attachOptions([row]);
    return menu ?? null;
  }

  public async saveMenu(menu: ReactionRoleMenu): Promise<ReactionRoleMenu> {
    await this.db.ensureGuild(menu.guildId);
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.reactionRoleMenu.upsert({
        where: { id: menu.id },
        create: {
          id: menu.id,
          guildId: menu.guildId,
          title: menu.title,
          description: menu.description,
          color: menu.color,
          mode: menu.mode,
          exclusive: menu.exclusive,
          maxRoles: menu.maxRoles,
          channelId: menu.channelId,
          messageIds: menu.messageIds,
          richContent: menu.richContent as unknown as Prisma.InputJsonValue,
          createdAt: new Date(menu.createdAt),
          updatedAt: now,
        },
        update: {
          title: menu.title,
          description: menu.description,
          color: menu.color,
          mode: menu.mode,
          exclusive: menu.exclusive,
          maxRoles: menu.maxRoles,
          channelId: menu.channelId,
          messageIds: menu.messageIds,
          richContent: menu.richContent as unknown as Prisma.InputJsonValue,
          updatedAt: now,
        },
      });
      await tx.reactionRoleOption.deleteMany({ where: { menuId: menu.id } });
      if (menu.options.length > 0) {
        await tx.reactionRoleOption.createMany({
          data: menu.options.map((option, position) => ({
            menuId: menu.id,
            slug: option.id,
            position,
            label: option.label,
            emoji: option.emoji,
            description: option.description,
            roleId: option.roleId,
            requiredRoleId: option.requiredRoleId,
          })),
        });
      }
      return saved;
    });
    const [saved] = await this.attachOptions([row]);
    return saved!;
  }

  public async deleteMenu(guildId: string, menuId: string): Promise<boolean> {
    await this.db.ensureGuild(guildId);
    const { count } = await this.prisma.reactionRoleMenu.deleteMany({
      where: { id: menuId, guildId },
    });
    return count > 0;
  }

  public async findMenuByMessage(
    guildId: string,
    messageId: string,
  ): Promise<ReactionRoleMenu | null> {
    const row = await this.prisma.reactionRoleMenu.findFirst({
      where: { guildId, messageIds: { has: messageId } },
    });
    if (!row) return null;
    const [menu] = await this.attachOptions([row]);
    return menu ?? null;
  }

  public async trackMenuMessage(
    menu: ReactionRoleMenu,
    channelId: string,
    messageId: string,
  ): Promise<ReactionRoleMenu> {
    const messageIds = menu.messageIds.includes(messageId)
      ? menu.messageIds
      : [...menu.messageIds, messageId];
    return this.saveMenu({ ...menu, channelId, messageIds });
  }

  public countMenus(guildId: string): Promise<number> {
    return this.prisma.reactionRoleMenu.count({ where: { guildId } });
  }
}
