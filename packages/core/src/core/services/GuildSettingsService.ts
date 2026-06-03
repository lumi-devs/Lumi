import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";

@ApplyOptions<Piece.Options>({ name: "guild-settings" })
export class GuildSettingsService extends Service {
  public async setDashboardLayout(guildId: string, rawLayout: string) {
    let layout: unknown;
    try {
      layout = JSON.parse(rawLayout);
    } catch {
      throw new Error("The layout must be valid JSON (parse failed).");
    }
    if (!Array.isArray(layout)) {
      throw new Error("The layout must be a valid JSON array of widget names.");
    }

    await this.container.db.config.setModuleConfig(
      guildId,
      "core",
      "dashboard_layout",
      layout,
    );

    if (this.container.rabbit) {
      await this.container.rabbit.publishEvent("dashboard.layout.updated", {
        guildId,
        layout,
      });
    }

    return layout;
  }

  public async setPrefix(guildId: string, newPrefix: string) {
    if (newPrefix.length > 5)
      throw new Error("Prefix must be 5 characters or less.");

    const tx = await this.container.db.transaction(guildId);
    try {
      if (tx.settings.prefix === newPrefix) {
        throw new Error(`Prefix is already set to \`${newPrefix}\`.`);
      }
      await tx.write({ prefix: newPrefix }).submit();
    } finally {
      tx.dispose();
    }
  }

  public async resetPrefix(guildId: string) {
    const tx = await this.container.db.transaction(guildId);
    try {
      if (tx.settings.prefix === null) {
        throw new Error("Prefix is already unset (using default).");
      }
      await tx.write({ prefix: null }).submit();
    } finally {
      tx.dispose();
    }
  }
}
