import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  ephemeralCard,
  makeErrorCard,
  type CardReply,
} from "@lumi/ui";
import type {
  Guild,
  GuildBasedChannel,
  GuildMember,
  Message,
  User,
} from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { buildContextValues } from "./context.js";
import { getCustomCommandsConfig, type CustomCommandsConfig } from "./config.js";
import { renderTemplate } from "./interpreter/index.js";
import { createKvAdapter } from "./kv.js";
import {
  buildResponseCard,
  parseResponses,
  renderedResponseSize,
} from "./responses.js";
import type {
  CustomCommandRow,
  ExecutionReplyTarget,
  ResponseSpec,
  TriggerSnapshot,
} from "./types.js";
import { Limits } from "./types.js";

export interface RunCommandInput {
  guild: Guild;
  actor: User;
  member: GuildMember | null;
  channel: GuildBasedChannel | null;
  message?: Message | null;
  args: string[];
  trigger: TriggerSnapshot;
  modalFields?: Record<string, string>;
  selectValues?: string[];
  reply: ExecutionReplyTarget;
}

export type ExecutionResult =
  | { status: "ok" }
  | { status: "forbidden" }
  | { status: "cooldown"; remaining: number }
  | { status: "error"; message: string };

const LocalCooldowns = new Map<string, number>();

export function roleIdsOf(member: unknown): string[] {
  const roles = (member as { roles?: unknown } | null)?.roles;
  if (Array.isArray(roles)) {
    return roles.filter((value): value is string => typeof value === "string");
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

export async function hasPermitNode(
  services: ModuleServices,
  options: {
    guildId: string;
    userId: string;
    guildOwnerId: string;
    roleIds: string[];
    channelId?: string;
    node: string;
  },
): Promise<boolean> {
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: options.guildId,
        userId: options.userId,
        roleIds: options.roleIds,
        guildOwnerId: options.guildOwnerId,
        ...(options.channelId ? { channelId: options.channelId } : {}),
        permitNode: options.node,
      },
      services.client,
    );
    return Boolean(result?.allowed);
  } catch {
    return false;
  }
}

export async function canManage(
  options: {
    guildId: string;
    guildOwnerId: string;
    userId: string;
    member: unknown;
    channelId?: string;
  },
  services: ModuleServices,
): Promise<boolean> {
  if (options.userId === options.guildOwnerId) return true;
  const member = options.member as
    | { permissions?: { has?: (flag: bigint) => boolean } }
    | null
    | undefined;
  const permissions = member?.permissions;
  if (
    permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    permissions?.has?.(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  return hasPermitNode(services, {
    guildId: options.guildId,
    userId: options.userId,
    guildOwnerId: options.guildOwnerId,
    roleIds: roleIdsOf(options.member),
    ...(options.channelId ? { channelId: options.channelId } : {}),
    node: "cc.manage",
  });
}

async function authorizedForCommand(
  services: ModuleServices,
  command: CustomCommandRow,
  input: RunCommandInput,
): Promise<boolean> {
  const nodes = command.permissionNodes ?? [];
  if (nodes.length === 0) return true;

  for (const node of nodes) {
    const allowed = await hasPermitNode(services, {
      guildId: input.guild.id,
      userId: input.actor.id,
      guildOwnerId: input.guild.ownerId,
      roleIds: roleIdsOf(input.member),
      ...(input.channel ? { channelId: input.channel.id } : {}),
      node,
    });
    if (allowed) return true;
  }
  return false;
}

export async function checkCooldown(
  services: ModuleServices,
  guildId: string,
  commandId: string,
  userId: string,
  seconds: number,
): Promise<number> {
  if (seconds <= 0) return 0;
  const key = `lumi:custom-commands:cooldown:${guildId}:${commandId}:${userId}`;
  const redis = services.redis;
  if (redis && typeof redis.set === "function") {
    try {
      const result = await redis.set(key, "1", "EX", seconds, "NX");
      if (result === "OK") return 0;
      const ttl = Number(await redis.ttl(key));
      return Number.isFinite(ttl) && ttl > 0 ? ttl : 1;
    } catch {
      // Fall through to the process-local cooldown.
    }
  }

  const now = Date.now();
  const expiresAt = LocalCooldowns.get(key) ?? 0;
  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1_000);
  LocalCooldowns.set(key, now + seconds * 1_000);
  return 0;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function asRecord(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, any>)
    : null;
}

async function sendCard(
  reply: ExecutionReplyTarget,
  card: CardReply,
  first: boolean,
): Promise<void> {
  if (reply.kind === "interaction") {
    const interaction = asRecord(reply.interaction);
    if (!interaction) throw new Error("Interaction reply target is missing.");
    if (!first && typeof interaction.followUp === "function") {
      await interaction.followUp(card);
      return;
    }
    if (typeof interaction.reply === "function") {
      await interaction.reply(card);
      return;
    }
    throw new Error("Interaction cannot be replied to.");
  }

  if (reply.kind === "message") {
    const message = asRecord(reply.message);
    if (!message) throw new Error("Message reply target is missing.");
    if (first && typeof message.reply === "function") {
      await message.reply(cardMessage(card));
      return;
    }
    const channel = asRecord(message.channel);
    if (channel && typeof channel.send === "function") {
      await channel.send(cardCreateOptions(card));
      return;
    }
    throw new Error("Message channel cannot be used to send responses.");
  }

  const channel = asRecord(reply.channel);
  if (!channel || typeof channel.send !== "function") {
    throw new Error("No text channel is available for this response.");
  }
  await channel.send(cardCreateOptions(card));
}

export async function notifyProblem(
  reply: ExecutionReplyTarget,
  title: string,
  body: string,
  emoji: string,
): Promise<void> {
  if (reply.kind === "interaction") {
    const interaction = asRecord(reply.interaction);
    if (interaction && typeof interaction.reply === "function") {
      await interaction
        .reply(ephemeralCard(makeErrorCard(title, body)))
        .catch(() => undefined);
    }
    return;
  }

  const message =
    reply.kind === "message" ? asRecord(reply.message) : null;
  if (message && typeof message.react === "function") {
    await message.react(emoji).catch(() => undefined);
  }
}

async function renderResponses(
  services: ModuleServices,
  command: CustomCommandRow,
  input: RunCommandInput,
  config: CustomCommandsConfig,
): Promise<CardReply[]> {
  const responses = parseResponses(command.responses);
  const values = buildContextValues({
    guild: input.guild,
    actor: input.actor,
    member: input.member,
    channel: input.channel,
    message: input.message ?? null,
    args: input.args,
    trigger: input.trigger,
    modalFields: input.modalFields,
    selectValues: input.selectValues,
  });
  const kv = createKvAdapter(services, input.guild.id, input.actor.id);
  const deadline = Date.now() + config.responseTimeoutMs;
  let totalBytes = 0;
  const cards: CardReply[] = [];

  for (const response of responses) {
    const remaining = Math.max(1, deadline - Date.now());
    const build = async (): Promise<{ card: CardReply; size: number }> => {
      const titleTemplate =
        typeof response === "string"
          ? command.name
          : (response.title ?? command.name);
      const bodyTemplates =
        typeof response === "string"
          ? [response]
          : Array.isArray(response.body)
            ? response.body
            : [response.body];

      const renderedTitle = await renderTemplate(titleTemplate, { values, kv });
      const renderedBodyParts = await Promise.all(
        bodyTemplates.map((template) => renderTemplate(template, { values, kv })),
      );
      const body =
        renderedBodyParts.length === 1
          ? renderedBodyParts[0]!
          : renderedBodyParts;
      const size = renderedResponseSize(renderedTitle, body);
      return {
        card: buildResponseCard(command.name, response as ResponseSpec, renderedTitle, body),
        size,
      };
    };

    const built = await withTimeout(
      build(),
      remaining,
      "Custom command response rendering",
    );
    totalBytes += built.size;
    if (totalBytes > Limits.renderedOutputBytes) {
      throw new Error(
        `Rendered output exceeds ${Limits.renderedOutputBytes} bytes.`,
      );
    }
    cards.push(built.card);
  }

  return cards;
}

export async function executeCustomCommand(
  services: ModuleServices,
  command: CustomCommandRow,
  input: RunCommandInput,
  config?: CustomCommandsConfig,
): Promise<ExecutionResult> {
  if (!command.enabled) return { status: "error", message: "Command is disabled." };

  if (!(await authorizedForCommand(services, command, input))) {
    return { status: "forbidden" };
  }

  const remaining = await checkCooldown(
    services,
    input.guild.id,
    command.id,
    input.actor.id,
    command.cooldownSeconds,
  );
  if (remaining > 0) return { status: "cooldown", remaining };

  const resolvedConfig =
    config ?? (await getCustomCommandsConfig(services, input.guild.id));

  let cards: CardReply[];
  try {
    cards = await renderResponses(services, command, input, resolvedConfig);
  } catch (error) {
    services.observability?.logger?.warn?.(
      "[custom-commands] response rendering failed",
      {
        guildId: input.guild.id,
        command: command.name,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Response rendering failed.",
    };
  }

  try {
    for (let index = 0; index < cards.length; index++) {
      if (index >= Limits.apiCallsPerRun) {
        throw new Error(
          `Sending responses exceeds the ${Limits.apiCallsPerRun} API call limit.`,
        );
      }
      const remainingTime = Math.max(1, resolvedConfig.responseTimeoutMs);
      await withTimeout(
        sendCard(input.reply, cards[index]!, index === 0),
        remainingTime,
        "Custom command response delivery",
      );
    }
  } catch (error) {
    services.observability?.logger?.warn?.(
      "[custom-commands] response delivery failed",
      {
        guildId: input.guild.id,
        command: command.name,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Response delivery failed.",
    };
  }

  return { status: "ok" };
}
