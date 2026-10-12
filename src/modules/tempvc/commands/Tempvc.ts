import type { CommandContext } from "#src/lib/commands/Context.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { Container } from "#src/lib/Services.js";
import {
  SlashCommandBuilder,
  ChannelType,
  ButtonStyle,
  type Guild,
  type GuildMember,
  type Interaction,
} from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { getVcRecord } from "#src/modules/tempvc/data/Tempvc.js";
import { buildPanel } from "#src/modules/tempvc/ui/Panel.js";
import { tempVcRegistry } from "#src/modules/tempvc/data/Registry.js";
import { TempvcMaxGenerators } from "#src/modules/tempvc/Constants.js";
import {
  makeErrorCard,
  makeInfoCard,
  type CardReply,
} from "#src/lib/ui/Cards.js";
import { createStringSelectMenu, createActionButton } from "#src/lib/ui/Panels.js";

const DefaultNameTemplate = "{username}'s Channel";

type AnyRow = ActionRowBuilder<MessageActionRowComponentBuilder | any>;

export async function assertTempvcAdmin(
  interaction: Interaction,
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;
  const user =
    "user" in interaction && interaction.user ? interaction.user : null;
  if (!user) return false;
  const member =
    "member" in interaction
      ? (interaction.member as GuildMember | null)
      : null;
  const cache = member?.roles && "cache" in member.roles ? member.roles.cache : null;
  const roleIds = cache ? [...cache.keys()] : [];
  const channelId =
    typeof interaction.channelId === "string" ? interaction.channelId : null;
  const ok = await authorize(
    {
      userId: user.id,
      guildId: guild.id,
      guildOwnerId: guild.ownerId,
      roleIds,
      ...(channelId ? { channelId } : {}),
    },
    { kind: "permit", node: "tempvc.admin" },
  ).catch(() => false);
  if (!ok && "reply" in interaction) {
    const repliable = interaction as {
      replied?: boolean;
      deferred?: boolean;
      reply(o: unknown): Promise<unknown>;
    };
    if (!repliable.replied && !repliable.deferred) {
      await repliable
        .reply({
          ...makeErrorCard(
            "Staff Only",
            "Managing generators needs the `tempvc.admin` permit.",
          ),
          flags: 64,
        })
        .catch(() => null);
    }
  }
  return ok;
}

async function defaultNameTemplate(
  services: Container,
  guildId: string,
): Promise<string> {
  const value = await services.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "default_name_template",
  );
  return typeof value === "string" && value.length > 0
    ? value.slice(0, 100)
    : DefaultNameTemplate;
}

async function channelLabel(
  guild: Guild,
  channelId: string,
): Promise<string> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && "name" in channel && typeof channel.name === "string") {
    return `#${channel.name}`;
  }
  return channelId;
}

export async function renderAdminCard(
  services: Container,
  guild: Guild,
): Promise<CardReply> {
  const guildId = guild.id;
  const generators = await services.db.tempvc.listGenerators(guildId);
  const lines = await Promise.all(
    generators.map(async (gen) => {
      const label = await channelLabel(guild, gen.channelId);
      const limit = gen.limit > 0 ? `limit ${gen.limit}` : "no limit";
      return `• ${label} — \`${gen.name}\` · ${limit}`;
    }),
  );
  const body =
    lines.length > 0
      ? lines.join("\n")
      : "-# *No generators yet. Pick a voice channel below to add one.*";
  const rows: AnyRow[] = [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("tempvc:admin:add")
        .setPlaceholder("Add a generator channel...")
        .setChannelTypes(ChannelType.GuildVoice),
    ),
  ];
  if (generators.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        createStringSelectMenu({
          customId: "tempvc:admin:manage",
          placeholder: "Manage a generator...",
          options: generators.slice(0, 25).map((gen) => ({
            label: gen.name.slice(0, 100),
            value: gen.channelId,
            description: `Edit ${gen.channelId}`,
          })),
        }),
      ),
    );
  }
  return makeInfoCard("🔊 Temp VC Generators", body, {
    breadcrumbs: ["Temp VC", "Generators"],
    footer:
      generators.length > 0
        ? `${generators.length}/${TempvcMaxGenerators} generators · pick one below to edit it`
        : "Pick a voice channel below to add your first generator.",
    separatorAboveActionRows: true,
    actionRows: rows,
  });
}

export async function renderGeneratorCard(
  services: Container,
  guild: Guild,
  channelId: string,
): Promise<CardReply> {
  const generators = await services.db.tempvc.listGenerators(guild.id);
  const gen = generators.find((g) => g.channelId === channelId);
  if (!gen) {
    return makeErrorCard("Generator Gone", "That generator no longer exists.");
  }
  const label = await channelLabel(guild, channelId);
  const limit = gen.limit > 0 ? `${gen.limit} users` : "unlimited";
  const rows: AnyRow[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createActionButton({
        customId: `tempvc:admin:name:${channelId}`,
        label: "Rename",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `tempvc:admin:limit:${channelId}`,
        label: "Set Limit",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: `tempvc:admin:rm:${channelId}`,
        label: "Remove",
        style: ButtonStyle.Danger,
      }),
      createActionButton({
        customId: "tempvc:admin:back",
        label: "Back",
        style: ButtonStyle.Secondary,
      }),
    ),
  ];
  return makeInfoCard(`🔊 ${label}`, [
    `**Name template:** \`${gen.name}\``,
    `**User limit:** ${limit}`,
    `-# Placeholders: \`{username}\`, \`{nickname}\`, \`{number}\`, \`{position}\` / \`{pos}\`.`,
  ], {
    breadcrumbs: ["Temp VC", "Generators", label],
    footer: "Rename edits the template ({number}, {pos}, {username}) · Set Limit caps users · 0 = unlimited.",
    separatorAboveActionRows: true,
    actionRows: rows,
  });
}

async function showPanel(ctx: CommandContext): Promise<void> {
  const t = await ctx.fetchT();
  const member = ctx.member;
  const channel = member?.voice.channel;
  if (!channel) {
    await ctx.replyError(
      t("tempvc:notInVcTitle"),
      t("tempvc:notInVcMessage"),
    );
    return;
  }
  const record = await getVcRecord(ctx.services, ctx.guildId!, channel.id);
  if (!record) {
    await ctx.replyError(
      t("tempvc:unmanagedChannelTitle"),
      t("tempvc:unmanagedChannelMessage"),
    );
    return;
  }
  await ctx.reply(await buildPanel(ctx.services, channel, record, t));
}

async function showAdmin(ctx: CommandContext): Promise<void> {
  const guild = ctx.guild;
  if (!guild) return;
  await ctx.reply(await renderAdminCard(ctx.services, guild));
}

export async function addGenerator(
  services: Container,
  guild: Guild,
  channelId: string,
): Promise<{ ok: boolean; message: string }> {
  const guildId = guild.id;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isVoiceBased()) {
    return { ok: false, message: "Pick a voice channel." };
  }
  const generators = await services.db.tempvc.listGenerators(guildId);
  if (generators.length >= TempvcMaxGenerators) {
    return { ok: false, message: "Generator limit reached." };
  }
  const name = await defaultNameTemplate(services, guildId);
  await services.db.tempvc.upsertGenerator(guildId, channelId, {
    name,
    limit: 0,
  });
  await tempVcRegistry.invalidateGenerators(guildId).catch(() => null);
  return { ok: true, message: `Generator added for <#${channelId}>.` };
}

export async function removeGenerator(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const removed = await services.db.tempvc.deleteGenerator(
    guildId,
    channelId,
  );
  if (removed) {
    await tempVcRegistry.invalidateGenerators(guildId).catch(() => null);
  }
  return removed;
}

export async function updateGenerator(
  services: Container,
  guildId: string,
  channelId: string,
  patch: { name?: string; limit?: number },
): Promise<boolean> {
  const generators = await services.db.tempvc.listGenerators(guildId);
  const gen = generators.find((g) => g.channelId === channelId);
  if (!gen) return false;
  await services.db.tempvc.upsertGenerator(guildId, channelId, {
    name: patch.name ?? gen.name,
    limit: patch.limit ?? gen.limit,
  });
  await tempVcRegistry.invalidateGenerators(guildId).catch(() => null);
  return true;
}

export const tempvcDef: CommandDef = {
  name: "tempvc",
  module: "tempvc",
  description: "Open the control panel for your current temp VC.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 3000,
  build: () => {
    const builder = new SlashCommandBuilder().setName("tempvc");
    return builder
      .setName("tempvc")
      .setDescription("Voice channel controls and generator management.")
      .addSubcommand((sub) =>
        sub.setName("panel").setDescription("Open your temp VC control panel."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("admin")
          .setDescription("Manage voice generator channels (staff only)."),
      );
  },
  run: async (ctx: CommandContext) => {
    await showPanel(ctx);
  },
  defaultSub: "panel",
  handlers: {
    panel: async (ctx: CommandContext) => {
      await showPanel(ctx);
    },
    admin: {
      run: async (ctx: CommandContext) => {
        await showAdmin(ctx);
      },
      requiredPermit: "tempvc.admin",
    },
  },
};
