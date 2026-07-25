import { Precondition, container, type Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import { LanguageKeys } from "#lib/i18n/keys.js";

export class ModuleEnabledPrecondition extends Precondition {
  public override async chatInputRun(
    interaction: ChatInputCommandInteraction,
    command: Command,
  ) {
    return this.#check(interaction.guildId, command);
  }

  public override async messageRun(message: Message, command: Command) {
    return this.#check(message.guildId, command);
  }

  public override async contextMenuRun(
    interaction: ContextMenuCommandInteraction,
    command: Command,
  ) {
    return this.#check(interaction.guildId, command);
  }

  async #check(guildId: string | null, command: Command) {
    const moduleName = this.#getModuleName(command);
    if (!moduleName) return this.ok();

    if (container.moduleStore && !container.moduleStore.isModuleDisableable(moduleName)) {
      return this.ok();
    }

    const enabled = await container.db.modules.isModuleEnabled(
      guildId,
      moduleName,
    );
    if (!enabled) {
      return this.error({
        identifier: "ModuleEnabled",
        message: guildId
          ? `The **${moduleName}** module is disabled in this server.`
          : "This feature is currently disabled.",
        context: {
          i18nKey: LanguageKeys.Preconditions.ModuleDisabled,
          module: moduleName,
        },
      });
    }

    return this.ok();
  }

  #getModuleName(command: Command): string | null {
    if (command.options.module) return command.options.module;
    const loc = command.location?.full;
    if (loc) {
      const byStore = container.moduleStore.moduleNameForLocation(loc);
      if (byStore) return byStore;
    }
    const match = /modules[/\\]([^/\\]+)[/\\]/.exec(loc ?? "");
    return match?.[1] ?? null;
  }
}

declare module "@sapphire/framework" {
  interface Preconditions {
    ModuleEnabled: never;
  }

  interface CommandOptions {
    module?: string;
  }
}
