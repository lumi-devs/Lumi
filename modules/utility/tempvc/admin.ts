import { isSnowflake } from "@lumi/foundation";
import {
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { canUseTempVcAdmin } from "./access.js";
import { getTempVcConfig, saveTempVcConfig } from "./config.js";
import {
  stripPrefix,
  TempVcIds,
  TempVcPrefixes,
} from "./ids.js";
import {
  type TempVcConfig,
  TempVcConfigSchema,
  type TempVcGenerator,
} from "./panel.js";
import { replyError, showCard } from "./reply.js";
import {
  adminPanelCard,
  configPanelCard,
  generatorManageCard,
  generatorRemoveCard,
} from "./ui-admin.js";

async function showAdminPanel(
  interaction: any,
  services: any,
  notice?: string,
): Promise<void> {
  const config = await getTempVcConfig(services, interaction.guildId);
  await showCard(
    interaction,
    adminPanelCard(interaction.guild ?? null, config, notice),
  );
}

async function loadGenerator(
  interaction: any,
  services: any,
  generatorId: string,
): Promise<{ config: TempVcConfig; generator: TempVcGenerator } | null> {
  const config = await getTempVcConfig(services, interaction.guildId);
  const generator = config.generators.find(
    (item) => item.channelId === generatorId,
  );
  if (!generator) {
    await replyError(
      interaction,
      "Generator Missing",
      "That generator is no longer configured.",
    );
    return null;
  }
  return { config, generator };
}

async function showGeneratorPanel(
  interaction: any,
  services: any,
  generatorId: string,
  notice?: string,
): Promise<void> {
  const loaded = await loadGenerator(interaction, services, generatorId);
  if (!loaded) return;
  await showCard(
    interaction,
    generatorManageCard(
      interaction.guild ?? null,
      loaded.generator,
      loaded.config,
      notice,
    ),
  );
}

const configFieldMeta: Record<
  string,
  {
    title: string;
    label: string;
    maxLength: number;
    min?: number;
    max?: number;
    integer?: boolean;
  }
> = {
  templateName: {
    title: "Name Template",
    label: "Channel name template ({user} = member)",
    maxLength: 100,
  },
  defaultUserLimit: {
    title: "Default User Limit",
    label: "User limit (0 = unlimited)",
    maxLength: 2,
    min: 0,
    max: 99,
    integer: true,
  },
  defaultBitrate: {
    title: "Default Bitrate",
    label: "Bitrate in bps (8000-384000)",
    maxLength: 6,
    min: 8000,
    max: 384000,
    integer: true,
  },
  maxChannels: {
    title: "Max Channels",
    label: "Guild-wide channel limit",
    maxLength: 3,
    min: 1,
    max: 200,
    integer: true,
  },
  maxPerUser: {
    title: "Max Per User",
    label: "Channels one member may own",
    maxLength: 2,
    min: 1,
    max: 10,
    integer: true,
  },
  emptyTimeoutMs: {
    title: "Empty Timeout",
    label: "Milliseconds before empty deletion",
    maxLength: 9,
    min: 1000,
    max: 604800000,
    integer: true,
  },
};

async function openConfigModal(
  interaction: any,
  key: string,
  config: TempVcConfig,
): Promise<void> {
  const meta = configFieldMeta[key];
  if (!meta) {
    await replyError(interaction, "Unknown Setting", "That setting cannot be edited.");
    return;
  }
  const current = (config as Record<string, unknown>)[key];
  const modal = new ModalBuilder()
    .setCustomId(TempVcIds.cfgModal(key))
    .setTitle(meta.title)
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(meta.label)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(meta.maxLength)
          .setRequired(true)
          .setValue(String(current ?? "").slice(0, meta.maxLength)),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}

async function generatorModal(
  interaction: any,
  config: TempVcConfig,
  generatorId: string,
  kind: "rename" | "limit",
): Promise<void> {
  const generator = config.generators.find(
    (item) => item.channelId === generatorId,
  );
  if (!generator) {
    await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
    return;
  }
  const rename = kind === "rename";
  const modal = new ModalBuilder()
    .setCustomId(
      rename
        ? TempVcIds.adminModalRename(generator.channelId)
        : TempVcIds.adminModalLimit(generator.channelId),
    )
    .setTitle(rename ? "Rename Generator Template" : "Set Generator User Limit")
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(
            rename
              ? "Channel name template ({user} = member)"
              : "User limit (0 = unlimited)",
          )
          .setStyle(TextInputStyle.Short)
          .setMaxLength(rename ? 100 : 2)
          .setRequired(true)
          .setValue(
            rename
              ? (generator.templateName ?? config.templateName).slice(0, 100)
              : String(generator.userLimit ?? config.defaultUserLimit),
          ),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}

export async function handleAdminInteraction(
  interaction: any,
  services: any,
  customId: string,
): Promise<void> {
  if (!(await canUseTempVcAdmin(interaction, services))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need the **tempvc.admin** permit or **Manage Server** to use generator management.",
    );
    return;
  }

  if (customId === TempVcIds.adminAdd) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(interaction, "Invalid Channel", "Choose a voice channel.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    if (config.generators.some((item) => item.channelId === channelId)) {
      await showAdminPanel(
        interaction,
        services,
        "That channel is already a generator.",
      );
      return;
    }
    const next: TempVcConfig = {
      ...config,
      generators: [
        ...config.generators,
        {
          channelId,
          templateName: config.templateName,
          userLimit: config.defaultUserLimit,
        },
      ],
    };
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the generator.");
      return;
    }
    await showAdminPanel(interaction, services, `✅ Added <#${channelId}> as a generator.`);
    return;
  }

  if (customId === TempVcIds.adminPick) {
    const generatorId = interaction.values?.[0];
    if (!isSnowflake(generatorId)) {
      await replyError(interaction, "Invalid Generator", "Choose a generator.");
      return;
    }
    await showGeneratorPanel(interaction, services, generatorId);
    return;
  }

  if (customId === TempVcIds.adminBack) {
    await showAdminPanel(interaction, services);
    return;
  }

  if (customId === TempVcIds.adminConfig) {
    const config = await getTempVcConfig(services, interaction.guildId);
    await showCard(interaction, configPanelCard(config));
    return;
  }

  const adminRename = stripPrefix(customId, TempVcPrefixes.adminModalRename);
  if (adminRename) {
    const loaded = await loadGenerator(interaction, services, adminRename);
    if (!loaded) return;
    const { config, generator } = loaded;
    const value = String(
      interaction.fields.getTextInputValue("value") ?? "",
    ).trim();
    if (value.length === 0) {
      await replyError(interaction, "Invalid Template", "The template cannot be empty.");
      return;
    }
    generator.templateName = value.slice(0, 100);
    const saved = await saveTempVcConfig(services, interaction.guildId, config);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the template.");
      return;
    }
    await showGeneratorPanel(
      interaction,
      services,
      adminRename,
      "✏️ Template updated.",
    );
    return;
  }

  const adminLimit = stripPrefix(customId, TempVcPrefixes.adminModalLimit);
  if (adminLimit) {
    const loaded = await loadGenerator(interaction, services, adminLimit);
    if (!loaded) return;
    const { config, generator } = loaded;
    const raw = String(interaction.fields.getTextInputValue("value") ?? "").trim();
    const limit = Number.parseInt(raw, 10);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await replyError(interaction, "Invalid Limit", "Enter a number from 0 to 99.");
      return;
    }
    generator.userLimit = limit;
    const saved = await saveTempVcConfig(services, interaction.guildId, config);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the limit.");
      return;
    }
    await showGeneratorPanel(
      interaction,
      services,
      adminLimit,
      `🔢 Limit set to ${limit === 0 ? "unlimited" : limit}.`,
    );
    return;
  }

  const adminRemoveConfirm = stripPrefix(
    customId,
    TempVcPrefixes.adminRemoveConfirm,
  );
  if (adminRemoveConfirm) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const next: TempVcConfig = {
      ...config,
      generators: config.generators.filter(
        (item) => item.channelId !== adminRemoveConfirm,
      ),
    };
    if (next.generators.length === config.generators.length) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not remove the generator.");
      return;
    }
    await showAdminPanel(
      interaction,
      services,
      `🗑️ Removed <#${adminRemoveConfirm}> as a generator.`,
    );
    return;
  }

  const adminRemoveCancel = stripPrefix(
    customId,
    TempVcPrefixes.adminRemoveCancel,
  );
  if (adminRemoveCancel) {
    await showGeneratorPanel(interaction, services, adminRemoveCancel);
    return;
  }

  const adminRemove = stripPrefix(customId, TempVcPrefixes.adminRemove);
  if (adminRemove) {
    const loaded = await loadGenerator(interaction, services, adminRemove);
    if (!loaded) return;
    await showCard(
      interaction,
      generatorRemoveCard(interaction.guild ?? null, loaded.generator),
    );
    return;
  }

  const adminRenameButton = stripPrefix(customId, TempVcPrefixes.adminRename);
  if (adminRenameButton) {
    const config = await getTempVcConfig(services, interaction.guildId);
    await generatorModal(interaction, config, adminRenameButton, "rename");
    return;
  }

  const adminLimitButton = stripPrefix(customId, TempVcPrefixes.adminLimit);
  if (adminLimitButton) {
    const config = await getTempVcConfig(services, interaction.guildId);
    await generatorModal(interaction, config, adminLimitButton, "limit");
    return;
  }

  if (customId === TempVcIds.cfgCategory) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(interaction, "Invalid Category", "Choose a category.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    const saved = await saveTempVcConfig(services, interaction.guildId, {
      ...config,
      categoryId: channelId,
    });
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the category.");
      return;
    }
    await showCard(
      interaction,
      configPanelCard(
        { ...config, categoryId: channelId },
        `✅ Category set to <#${channelId}>.`,
      ),
    );
    return;
  }

  if (customId === TempVcIds.cfgEdit) {
    const key = interaction.values?.[0];
    if (typeof key !== "string") {
      await replyError(interaction, "Invalid Setting", "Choose a setting.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    if (key === "ownerLeaveDelete") {
      const saved = await saveTempVcConfig(services, interaction.guildId, {
        ...config,
        ownerLeaveDelete: !config.ownerLeaveDelete,
      });
      if (!saved) {
        await replyError(interaction, "Save Failed", "Could not save the setting.");
        return;
      }
      await showCard(
        interaction,
        configPanelCard(
          { ...config, ownerLeaveDelete: !config.ownerLeaveDelete },
          `🚪 Delete on owner leave ${config.ownerLeaveDelete ? "disabled" : "enabled"}.`,
        ),
      );
      return;
    }
    await openConfigModal(interaction, key, config);
    return;
  }

  const cfgModal = stripPrefix(customId, TempVcPrefixes.cfgModal);
  if (cfgModal) {
    const meta = configFieldMeta[cfgModal];
    if (!meta) {
      await replyError(interaction, "Unknown Setting", "That setting cannot be edited.");
      return;
    }
    const raw = String(interaction.fields.getTextInputValue("value") ?? "").trim();
    let value: string | number;
    if (meta.integer) {
      const parsed = Number.parseInt(raw, 10);
      const min = meta.min ?? Number.MIN_SAFE_INTEGER;
      const max = meta.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        await replyError(
          interaction,
          "Invalid Value",
          `Enter a whole number from ${min} to ${max}.`,
        );
        return;
      }
      value = parsed;
    } else {
      if (raw.length === 0) {
        await replyError(interaction, "Invalid Value", "Enter a value.");
        return;
      }
      value = raw.slice(0, meta.maxLength);
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    const next = TempVcConfigSchema.parse({
      ...config,
      [cfgModal]: value,
    });
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the setting.");
      return;
    }
    await showCard(interaction, configPanelCard(next, `✅ **${meta.title}** updated.`));
    return;
  }

  await showAdminPanel(interaction, services);
}
