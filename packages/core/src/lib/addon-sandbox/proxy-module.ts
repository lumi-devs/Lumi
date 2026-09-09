import { container } from "@sapphire/framework";
import { Module } from "#lib/module-system/Module.js";
import { scanKeysSafe } from "#lib/database/cluster-safe.js";

export class ProxyModule extends Module {
  // Swept host-side rather than asked of the addon, so it works while the addon
  // is crashed, disabled or uninstalled. Only data keyed to the user is matched;
  // a user id inside another row's value stays, since that row is shared.
  public override async deleteUserData(userId: string): Promise<void> {
    const rows = await container.db.guildKV.deleteModuleDataForTarget(this.name, userId);
    const members = await this.#forgetRedisMember(userId);
    container.logger.info(
      `[GDPR] Addon '${this.name}': removed ${rows} KV row(s) and ${members} Redis membership(s) for ${userId}`,
    );
  }

  public override async exportUserData(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await container.db.guildKV.listModuleDataForTarget(this.name, userId);
    return rows.length > 0 ? { moduleData: rows } : null;
  }

  async #forgetRedisMember(userId: string): Promise<number> {
    const keys = await scanKeysSafe(container.redis, `lumi:addon:${this.name}:*`);
    if (keys.length === 0) return 0;

    const pipeline = container.redis.pipeline();
    for (const key of keys) pipeline.srem(key, userId);
    const results = await pipeline.exec();

    // A non-set key answers WRONGTYPE rather than failing the pipeline.
    return (results ?? []).filter(([err, removed]) => !err && removed === 1).length;
  }
}
