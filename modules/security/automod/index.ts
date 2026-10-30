import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import {
  cardMessage,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
} from "@lumi/ui";
import {
  type GuildMember,
  type Message,
  SlashCommandBuilder,
} from "discord.js";
import { z } from "zod";
import { getSecurityConfig } from "../config.js";
import { startPanic } from "../panic/state.js";
import {
  applyResponse,
  deleteStored,
  getStoredJson,
  hasPermit,
  incrementWindow,
  readModuleConfig,
  redisOf,
  securityCard,
  securityKey,
  sendSecurityLog,
  setStoredJson,
} from "../shared.js";

const ModuleName = "security-automod";

const AutomodConfigSchema = z.object({
  enabled: z.boolean().default(false),
  perMessage: z.number().int().min(0).max(100).default(0),
  perMention: z.number().int().min(0).max(100).default(3),
  perDuplicate: z.number().int().min(0).max(100).default(5),
  perSimilar: z.number().int().min(0).max(100).default(0),
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  perZalgo: z.number().int().min(0).max(100).default(0),
  perFilterHit: z.number().int().min(0).max(100).default(10),
  perAttachment: z.number().int().min(0).max(100).default(0),
  perEmoji: z.number().int().min(0).max(100).default(0),
  perLink: z.number().int().min(0).max(100).default(0),
  webhookMultiplier: z.number().int().min(1).max(20).default(1),
  decayPerMinute: z.number().int().min(1).max(100).default(10),
  warnThreshold: z.number().int().min(0).max(1000).default(15),
  timeoutThreshold: z.number().int().min(0).max(1000).default(30),
  quarantineThreshold: z.number().int().min(0).max(1000).default(0),
  timeoutMinutes: z.number().int().min(1).max(40320).default(10),
  multiplierEnabled: z.boolean().default(false),
  multiplierBase: z.number().int().min(2).max(10).default(2),
  panicRaiderCount: z.number().int().min(0).max(100).default(0),
  panicWindowSeconds: z.number().int().min(5).max(600).default(30),
  lockdownMentionThreshold: z.number().int().min(0).max(10000).default(0),
  lockdownWindowSeconds: z.number().int().min(5).max(600).default(30),
  lockdownDurationMinutes: z.number().int().min(1).max(1440).default(10),
  terms: z.array(z.string()).default([]),
  regexRules: z.array(z.string()).default([]),
  blockInvites: z.boolean().default(false),
  inviteAllowlist: z.array(z.string()).default([]),
  blockLinks: z.boolean().default(false),
  linkAllowlist: z.array(z.string()).default([]),
  maxMentions: z.number().int().min(0).max(50).default(0),
  maxCapsPercent: z.number().int().min(0).max(100).default(0),
  capsMinLength: z.number().int().min(1).max(500).default(12),
  filterTimeoutMinutes: z.number().int().min(0).max(40320).default(0),
  logChannelId: z.string().nullable().default(null),
});

type AutomodConfig = z.infer<typeof AutomodConfigSchema>;

interface HeatState {
  heat: number;
  at: number;
}

const InvitePattern =
  /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;
const LinkPattern = /https?:\/\/[^\s<>]+/gi;
function countZalgo(text: string): number {
  let count = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const combining =
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x0483 && code <= 0x0489) ||
      (code >= 0x1ab0 && code <= 0x1aff) ||
      (code >= 0x1dc0 && code <= 0x1dff) ||
      (code >= 0x20d0 && code <= 0x20ff) ||
      (code >= 0xfe20 && code <= 0xfe2f);
    if (combining) count += 1;
  }
  return count;
}

const EmojiPattern = /<a?:\w+:\d+>|[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu;
const WordPattern = /[\p{L}\p{N}]+/gu;

function similarity(a: string, b: string): number {
  const left = new Set(a.toLowerCase().match(WordPattern) ?? []);
  const right = new Set(b.toLowerCase().match(WordPattern) ?? []);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function hostAllowed(url: string, allowlist: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.some((entry) => {
      const allowed = entry.toLowerCase().replace(/^https?:\/\//, "");
      return host === allowed || host.endsWith(`.${allowed}`);
    });
  } catch {
    return false;
  }
}

function applyFilters(
  message: Message,
  config: AutomodConfig,
): { reasons: string[]; heat: number } {
  const content = message.content;
  const lower = content.toLowerCase();
  const reasons: string[] = [];
  let heat =
    config.perMessage +
    config.perMention *
      (message.mentions.users.size + message.mentions.roles.size);

  for (const term of config.terms) {
    if (term.length > 0 && lower.includes(term.toLowerCase())) {
      reasons.push(`term:${term}`);
    }
  }

  for (const rule of config.regexRules) {
    try {
      if (new RegExp(rule, "i").test(content)) reasons.push("regex");
    } catch {}
  }

  if (config.blockInvites) {
    const invites = [...content.matchAll(InvitePattern)];
    const blocked = invites.filter(
      (match) => !config.inviteAllowlist.includes(match[1] ?? ""),
    );
    if (blocked.length > 0) reasons.push("invite");
  }

  if (config.blockLinks) {
    const links = content.match(LinkPattern) ?? [];
    const blocked = links.filter(
      (url) => !hostAllowed(url, config.linkAllowlist),
    );
    if (blocked.length > 0) {
      reasons.push("link");
      heat += config.perLink * blocked.length;
    }
  }

  const mentions = message.mentions.users.size + message.mentions.roles.size;
  if (config.maxMentions > 0 && mentions > config.maxMentions) {
    reasons.push("mentions");
  }

  if (config.maxCapsPercent > 0) {
    const letters = content.replace(/[^\p{L}]/gu, "");
    if (letters.length >= config.capsMinLength) {
      const caps = content.replace(/[^\p{Lu}]/gu, "").length;
      if ((caps / letters.length) * 100 >= config.maxCapsPercent) {
        reasons.push("caps");
      }
    }
  }

  const zalgo = countZalgo(content);
  if (config.perZalgo > 0 && zalgo > 5) {
    reasons.push("zalgo");
    heat += config.perZalgo;
  }

  const emoji = content.match(EmojiPattern)?.length ?? 0;
  if (config.perEmoji > 0 && emoji > 0) {
    heat += config.perEmoji * Math.min(emoji, 10);
  }

  if (config.perAttachment > 0 && message.attachments.size > 0) {
    heat += config.perAttachment * message.attachments.size;
  }

  heat += config.perFilterHit * reasons.length;
  return { reasons, heat };
}

async function heatFor(
  services: ModuleServices,
  guildId: string,
  userId: string,
  delta: number,
  config: AutomodConfig,
): Promise<number> {
  const redis = redisOf(services);
  const key = securityKey("automod", "heat", guildId, userId);
  const stored = await getStoredJson<HeatState>(redis, key);
  const now = Date.now();
  const elapsedMinutes = stored ? Math.floor((now - stored.at) / 60_000) : 0;
  const decayed = stored
    ? Math.max(0, stored.heat - elapsedMinutes * config.decayPerMinute)
    : 0;
  const heat = decayed + delta;
  await setStoredJson(redis, key, { heat, at: now }, 86_400);
  return heat;
}

async function timeoutMember(
  member: GuildMember,
  minutes: number,
  reason: string,
): Promise<boolean> {
  return member
    .timeout(minutes * 60_000, reason)
    .then(() => true)
    .catch(() => false);
}

async function punish(
  services: ModuleServices,
  message: Message,
  member: GuildMember,
  config: AutomodConfig,
  heat: number,
): Promise<string> {
  const guild = message.guild;
  if (!guild) return "failed";
  const security = await getSecurityConfig(services, guild.id);
  const reason = `Automod heat ${heat}`;

  if (config.quarantineThreshold > 0 && heat >= config.quarantineThreshold) {
    return applyResponse(
      services,
      guild,
      security,
      member.id,
      "quarantine",
      reason,
    );
  }
  if (config.timeoutThreshold > 0 && heat >= config.timeoutThreshold) {
    return (await timeoutMember(member, config.timeoutMinutes, reason))
      ? "timed out"
      : "failed";
  }
  if (config.warnThreshold > 0 && heat >= config.warnThreshold) {
    await message
      .reply(
        cardMessage(
          noPingCard(
            makeWarningCard("🤖 Automod Warning", [
              `**Member**\n<@${member.id}>`,
              `**Heat**\n${heat}`,
              "Slow down or you will be timed out.",
            ]),
          ),
        ),
      )
      .catch(() => undefined);
    return "warned";
  }
  return "logged";
}

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: ModuleServices) {
    if (!message.inGuild() || message.author.bot) return;
    const guild = message.guild;
    const member = message.member;
    if (!member) return;

    const config = await readModuleConfig(
      services,
      guild.id,
      ModuleName,
      AutomodConfigSchema,
      ModuleName,
    );
    if (!config.enabled) return;

    const security = await getSecurityConfig(services, guild.id);
    if (member.id === guild.ownerId) return;
    if (
      security.trustedRoleIds.some((roleId) => member.roles.cache.has(roleId))
    ) {
      return;
    }
    if (
      await hasPermit(
        services,
        guild,
        member,
        "automod.bypass",
        message.channelId,
      )
    ) {
      return;
    }

    const redis = redisOf(services);
    const lastKey = securityKey("automod", "last", guild.id, member.id);
    const previous = (await redis?.get(lastKey)) ?? "";
    const { reasons, heat: filterHeat } = applyFilters(message, config);

    let heat = filterHeat;
    if (config.perDuplicate > 0 && previous && previous === message.content) {
      heat += config.perDuplicate;
      reasons.push("duplicate");
    }
    if (config.perSimilar > 0 && previous) {
      const score = similarity(previous, message.content);
      if (score >= config.similarityThreshold) {
        heat += config.perSimilar;
        reasons.push("similar");
      }
    }
    if (redis) {
      await redis.set(lastKey, message.content.slice(0, 500), "EX", 600);
    }

    const panicActive = Boolean(
      await getStoredJson(redis, securityKey("panic", guild.id)),
    );
    if (config.multiplierEnabled && panicActive) {
      heat = Math.round(heat * config.multiplierBase);
    }

    const total = await heatFor(services, guild.id, member.id, heat, config);

    if (config.lockdownMentionThreshold > 0) {
      const mentions =
        message.mentions.users.size + message.mentions.roles.size;
      if (mentions > 0) {
        const count = await incrementWindow(
          redis,
          securityKey("automod", "mentions", guild.id),
          config.lockdownWindowSeconds,
          mentions,
        );
        if (count >= config.lockdownMentionThreshold) {
          await startPanic(
            services,
            guild.id,
            config.lockdownDurationMinutes,
            "Mention flood",
            services.client.user?.id ?? "automod",
            true,
          );
          await sendSecurityLog(
            services,
            guild.id,
            securityCard("🚨 Lockdown Triggered", [
              `**Reason**\nMention flood (${count} mentions)`,
              `**Duration**\n${config.lockdownDurationMinutes} minutes`,
            ]),
          );
        }
      }
    }

    if (reasons.length > 0) {
      await message.delete().catch(() => undefined);
    }

    if (
      reasons.length > 0 &&
      config.filterTimeoutMinutes > 0 &&
      (await timeoutMember(
        member,
        config.filterTimeoutMinutes,
        `Automod filter: ${reasons.join(", ")}`,
      ))
    ) {
      await sendSecurityLog(
        services,
        guild.id,
        securityCard("🤖 Automod Filter", [
          `**Member**\n<@${member.id}>`,
          `**Filters**\n${reasons.join(", ")}`,
          `**Action**\nTimed out for ${config.filterTimeoutMinutes}m`,
        ]),
      );
      return;
    }

    if (total < config.warnThreshold || config.warnThreshold === 0) {
      if (reasons.length > 0) {
        await sendSecurityLog(
          services,
          guild.id,
          securityCard("🤖 Automod Filter", [
            `**Member**\n<@${member.id}>`,
            `**Channel**\n<#${message.channelId}>`,
            `**Filters**\n${reasons.join(", ")}`,
            `**Heat**\n${total}`,
          ]),
        );
      }
      return;
    }

    const outcome = await punish(services, message, member, config, total);
    await deleteStored(
      redis,
      securityKey("automod", "heat", guild.id, member.id),
    );
    await sendSecurityLog(
      services,
      guild.id,
      securityCard("🤖 Automod Escalation", [
        `**Member**\n<@${member.id}>`,
        `**Channel**\n<#${message.channelId}>`,
        `**Heat**\n${total}`,
        `**Filters**\n${reasons.join(", ") || "heat"}`,
        `**Action**\n${outcome}`,
      ]),
    );
  },
};

const automodCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Inspect or reset automod heat")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show your current heat")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to inspect")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Clear a member's heat")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to reset")
            .setRequired(true),
        ),
    ),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    if (!interaction.guildId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Server Only", "Automod runs per server.")),
      );
      return;
    }
    const config = await readModuleConfig(
      services,
      interaction.guildId,
      ModuleName,
      AutomodConfigSchema,
      ModuleName,
    );
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user") ?? interaction.user;

    if (sub === "reset") {
      await deleteStored(
        redisOf(services),
        securityKey("automod", "heat", interaction.guildId, target.id),
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Heat Reset", `Cleared heat for <@${target.id}>.`),
        ),
      );
      return;
    }

    const stored = await getStoredJson<HeatState>(
      redisOf(services),
      securityKey("automod", "heat", interaction.guildId, target.id),
    );
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("🤖 Automod", [
          `**Member**\n<@${target.id}>`,
          `**Heat**\n${stored?.heat ?? 0}`,
          `**Warn**\n${config.warnThreshold || "disabled"}`,
          `**Timeout**\n${config.timeoutThreshold || "disabled"}`,
          `**Quarantine**\n${config.quarantineThreshold || "disabled"}`,
          `**Status**\n${config.enabled ? "Enabled" : "Disabled"}`,
        ]),
      ),
    );
  },
};

const automodModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Automod",
  emoji: "🤖",
  description:
    "Heat-based automod with 13 filters, escalating punishments, and permit-based immunity",
  version: "2.0.0",
  config: AutomodConfigSchema,
  commands: [automodCommand],
  listeners: [onMessageListener],
  tasks: [],
  async onLoad(_services) {
    console.log(`[${ModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${ModuleName}] Module unloaded`);
  },
});

export default automodModule;

export type { AutomodConfig };
