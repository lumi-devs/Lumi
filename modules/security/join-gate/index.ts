import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeInfoCard } from "@lumi/ui";
import { type GuildMember, SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import { getSecurityConfig } from "../config.js";
import {
  applyJoinAction,
  incrementWindow,
  isTrusted,
  type JoinAction,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
} from "../shared.js";

const ModuleName = "security-join-gate";

const JoinGateConfigSchema = z.object({
  enabled: z.boolean().default(false),
  minAccountAgeHours: z.number().int().min(0).max(8760).default(0),
  raidJoinCount: z.number().int().min(3).max(100).default(10),
  raidWindowSeconds: z.number().int().min(5).max(300).default(30),
  raidAction: z.enum(["kick", "timeout", "quarantine"]).default("kick"),
  raidAccountType: z.enum(["all", "suspicious"]).default("all"),
  raidWarnRoleIds: z.array(z.string()).default([]),
  filterNoAvatarEnabled: z.boolean().default(false),
  filterNoAvatarAction: z
    .enum(["log", "kick", "timeout", "quarantine"])
    .default("log"),
  filterMinAgeEnabled: z.boolean().default(false),
  filterMinAgeHours: z.number().int().min(0).max(8760).default(0),
  filterMinAgeAction: z
    .enum(["log", "kick", "timeout", "quarantine"])
    .default("kick"),
  filterUnverifiedBotEnabled: z.boolean().default(false),
  filterUnverifiedBotAction: z
    .enum(["log", "kick", "timeout", "quarantine"])
    .default("kick"),
  filterUsernamePatternEnabled: z.boolean().default(false),
  filterUsernamePatterns: z.array(z.string()).default([]),
  filterUsernamePatternAction: z
    .enum(["log", "kick", "timeout", "quarantine"])
    .default("log"),
  filterAdvertisingEnabled: z.boolean().default(false),
  filterAdvertisingAction: z
    .enum(["log", "kick", "timeout", "quarantine"])
    .default("kick"),
});

const InvitePattern =
  /(?:discord\.gg|discord(?:app)?\.com\/invite)\/|https?:\/\//i;
const ActionRank: Record<JoinAction, number> = {
  log: 0,
  timeout: 1,
  kick: 2,
  quarantine: 3,
};

function accountAgeHours(member: GuildMember): number {
  return (Date.now() - member.user.createdTimestamp) / 3_600_000;
}

function isSuspicious(member: GuildMember, minAgeHours: number): boolean {
  if (!member.user.avatar) return true;
  if (accountAgeHours(member) < Math.max(minAgeHours, 24)) return true;
  return InvitePattern.test(member.user.username);
}

function stronger(current: JoinAction, next: JoinAction): JoinAction {
  return ActionRank[next] > ActionRank[current] ? next : current;
}

function usernameMatches(member: GuildMember, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern, "i").test(member.user.username)) return true;
    } catch {}
  }
  return false;
}

const onMemberAddListener: ListenerDefinition = {
  event: "guildMemberAdd",
  async handler(member: GuildMember, services: ModuleServices) {
    const guild = member.guild;
    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      JoinGateConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;

    const security = await getSecurityConfig(services, guild.id);
    if (isTrusted(member, guild, security)) return;

    const redis = redisOf(services);
    const joins = await incrementWindow(
      redis,
      securityKey("join-gate", "raid", guild.id),
      config.raidWindowSeconds,
    );

    let action: JoinAction = "log";
    const reasons: string[] = [];

    if (joins >= config.raidJoinCount) {
      const suspicious = isSuspicious(member, config.minAccountAgeHours);
      if (config.raidAccountType === "all" || suspicious) {
        action = stronger(action, config.raidAction);
        reasons.push(`raid (${joins} joins/${config.raidWindowSeconds}s)`);
      }
    }

    if (config.filterNoAvatarEnabled && !member.user.avatar) {
      action = stronger(action, config.filterNoAvatarAction);
      reasons.push("no avatar");
    }

    if (
      config.filterMinAgeEnabled &&
      accountAgeHours(member) < config.filterMinAgeHours
    ) {
      action = stronger(action, config.filterMinAgeAction);
      reasons.push(`account age < ${config.filterMinAgeHours}h`);
    }

    if (
      config.filterUnverifiedBotEnabled &&
      member.user.bot &&
      !member.user.flags?.has("VerifiedBot")
    ) {
      action = stronger(action, config.filterUnverifiedBotAction);
      reasons.push("unverified bot");
    }

    if (
      config.filterUsernamePatternEnabled &&
      usernameMatches(member, config.filterUsernamePatterns)
    ) {
      action = stronger(action, config.filterUsernamePatternAction);
      reasons.push("username pattern");
    }

    if (
      config.filterAdvertisingEnabled &&
      InvitePattern.test(member.user.username)
    ) {
      action = stronger(action, config.filterAdvertisingAction);
      reasons.push("advertising");
    }

    if (reasons.length === 0) return;

    const outcome = await applyJoinAction(
      security,
      member,
      action,
      `Join gate: ${reasons.join(", ")}`,
    );

    services.observability?.logger?.warn?.("join gate action", {
      guildId: guild.id,
      userId: member.id,
      reasons,
      action,
      outcome,
    });

    const warns = config.raidWarnRoleIds.map((id) => `<@&${id}>`).join(" ");
    await sendSecurityLog(
      services,
      guild.id,
      securityCard("🚪 Join Gate", [
        `**Member**\n<@${member.id}> (\`${member.id}\`)`,
        `**Account age**\n${accountAgeHours(member).toFixed(1)}h`,
        `**Reasons**\n${reasons.join(", ")}`,
        `**Action**\n${outcome}`,
        ...(warns ? [`**Notify**\n${warns}`] : []),
      ]),
    );
  },
};

const joinGateCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("joingate")
    .setDescription("Show join gate configuration"),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Join gate runs per server."),
        ),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      JoinGateConfigSchema,
      ModuleName,
    );
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("🚪 Join Gate", [
          `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
          `**Raid trigger**\n${config.raidJoinCount} joins / ${config.raidWindowSeconds}s → ${config.raidAction}`,
          `**Raid account types**\n${config.raidAccountType}`,
          `**No avatar**\n${config.filterNoAvatarEnabled ? config.filterNoAvatarAction : "off"}`,
          `**Min age**\n${config.filterMinAgeEnabled ? `${config.filterMinAgeHours}h → ${config.filterMinAgeAction}` : "off"}`,
          `**Unverified bots**\n${config.filterUnverifiedBotEnabled ? config.filterUnverifiedBotAction : "off"}`,
          `**Username patterns**\n${config.filterUsernamePatternEnabled ? config.filterUsernamePatternAction : "off"}`,
          `**Advertising**\n${config.filterAdvertisingEnabled ? config.filterAdvertisingAction : "off"}`,
        ]),
      ),
    );
  },
};

const joinGateModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Join Gate",
  emoji: "🚪",
  description: "On-join security filters and raid detection",
  version: "2.0.0",
  config: JoinGateConfigSchema,
  commands: [joinGateCommand],
  listeners: [onMemberAddListener],
  tasks: [],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default joinGateModule;
