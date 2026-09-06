import { container } from "@sapphire/framework";
import { logError } from "#lib/utilities/errors.js";
import { getMenu, listMenus, type ReactionRoleMenu } from "./data.js";

const SigPrefix = "lumi:reactionroles:sig:";
const sig = {
  menusReload: (g: string) => `${SigPrefix}menusreload:${g}`,
};

class ReactionRoleRegistry {
  readonly #menus = new Map<string, Map<string, ReactionRoleMenu>>();
  readonly #loaded = new Set<string>();
  readonly #hydrating = new Map<string, Promise<void>>();
  #wired = false;

  public wire(): void {
    if (this.#wired) return;
    this.#wired = true;
    container.invalidation.onInvalidate((keys) => {
      for (const key of keys) {
        if (!key.startsWith(SigPrefix)) continue;
        const rest = key.slice(SigPrefix.length);
        if (rest.startsWith("menusreload:")) {
          const guildId = rest.slice("menusreload:".length);
          if (guildId) {
            this.#menus.delete(guildId);
            this.#loaded.delete(guildId);
          }
        }
      }
    });

    container.invalidation.onResync(() => {
      this.#menus.clear();
      this.#loaded.clear();
    });
  }

  public async getMenu(
    guildId: string,
    menuId: string,
  ): Promise<ReactionRoleMenu | null> {
    await this.#ensure(guildId);
    const cached = this.#menus.get(guildId)?.get(menuId);
    if (cached) return cached;
    const fresh = await getMenu(guildId, menuId).catch((err: unknown) => {
      logError("ReactionRoles: menu hydrate", err);
      return null;
    });
    if (fresh) this.#menus.get(guildId)?.set(menuId, fresh);
    return fresh;
  }

  public async findMenuByMessage(
    guildId: string,
    messageId: string,
  ): Promise<ReactionRoleMenu | null> {
    await this.#ensure(guildId);
    for (const menu of this.#menus.get(guildId)?.values() ?? []) {
      if (menu.messageIds.includes(messageId)) return menu;
    }
    const { findMenuByMessage } = await import("./data.js");
    const fresh = await findMenuByMessage(guildId, messageId).catch(
      (err: unknown) => {
        logError("ReactionRoles: message lookup", err);
        return null;
      },
    );
    return fresh;
  }

  public async invalidateMenus(guildId: string): Promise<void> {
    this.#menus.delete(guildId);
    this.#loaded.delete(guildId);
    await container.invalidation
      .invalidate(sig.menusReload(guildId))
      .catch((err: unknown) => logError("ReactionRoles: registry broadcast", err));
  }

  async #ensure(guildId: string): Promise<void> {
    if (this.#loaded.has(guildId)) return;
    let pending = this.#hydrating.get(guildId);
    if (!pending) {
      pending = (async () => {
        const rows = await listMenus(guildId);
        const map = new Map<string, ReactionRoleMenu>();
        for (const menu of rows) map.set(menu.id, menu);
        this.#menus.set(guildId, map);
        this.#loaded.add(guildId);
      })()
        .catch((err: unknown) => logError("ReactionRoles: hydrate", err))
        .finally(() => this.#hydrating.delete(guildId));
      this.#hydrating.set(guildId, pending);
    }
    await pending;
  }
}

export const reactionRoleRegistry = new ReactionRoleRegistry();
