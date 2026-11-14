import type { ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import { delKv, getKv, incrKv, listKv, setKv } from "../kv.js";

function parseKvValue(value: string): unknown {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export async function handleKv(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const action = interaction.options.getString("action", true);
  const key = interaction.options.getString("key");
  const userId = interaction.user.id;

  if (action === "list") {
    const entries = await listKv(services, guild.id, userId);
    if (entries.length === 0) {
      await interaction.reply(
        ephemeralCard(makeInfoCard("KV Store", "You have no KV entries.")),
      );
      return;
    }
    await interaction.reply(
      ephemeralCard(
        makeListCard(
          "Your KV Store",
          entries.map((entry) => {
            const expires = entry.expiresAt
              ? ` · expires ${entry.expiresAt.toISOString()}`
              : "";
            return `**${entry.key}**${expires}`;
          }),
        ),
      ),
    );
    return;
  }

  if (!key || key.trim().length === 0) {
    throw new Error("KV key is required.");
  }

  if (action === "get") {
    const value = await getKv(services, guild.id, userId, key);
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("KV Value", [
          `**Key**\n${key}`,
          `**Value**\n\`\`\`json\n${JSON.stringify(value, null, 2).slice(0, 1_500)}\n\`\`\``,
        ]),
      ),
    );
    return;
  }

  if (action === "set") {
    const value = interaction.options.getString("value");
    if (value === null) throw new Error("KV value is required.");
    const ttl = interaction.options.getInteger("ttl") ?? undefined;
    const stored = await setKv(
      services,
      guild.id,
      userId,
      key,
      parseKvValue(value),
      ttl,
    );
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("KV Saved", [
          `**Key**\n${key}`,
          `**Value**\n${JSON.stringify(stored).slice(0, 500)}`,
          ...(ttl ? [`**TTL**\n${ttl}s`] : []),
        ]),
      ),
    );
    return;
  }

  if (action === "incr") {
    const by = interaction.options.getInteger("by") ?? 1;
    const value = await incrKv(services, guild.id, userId, key, by);
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("KV Incremented", `**${key}** is now **${value}**.`),
      ),
    );
    return;
  }

  if (action === "del") {
    const deleted = await delKv(services, guild.id, userId, key);
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "KV Deleted",
          deleted
            ? `Deleted **${key}**.`
            : `No entry named **${key}** existed.`,
        ),
      ),
    );
    return;
  }

  throw new Error(`Unknown KV action "${action}".`);
}
