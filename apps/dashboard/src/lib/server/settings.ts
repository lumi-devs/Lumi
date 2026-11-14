import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma";

export type GuildSettings = Record<string, unknown>;

export function asSettings(value: unknown): GuildSettings {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as GuildSettings)
    : {};
}

export async function readGuildSettings(
  guildId: string,
): Promise<GuildSettings> {
  const guild = await getPrisma().guild.findUnique({
    where: { id: guildId },
    select: { settings: true },
  });
  return asSettings(guild?.settings);
}

export async function ensureGuild(guildId: string): Promise<void> {
  await getPrisma().guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });
}

function isRetryable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

async function mutateSettings(
  guildId: string,
  mutate: (settings: GuildSettings) => void,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await getPrisma().$transaction(
        async (tx) => {
          const guild = await tx.guild.findUnique({
            where: { id: guildId },
            select: { settings: true },
          });
          const settings = asSettings(guild?.settings);
          mutate(settings);
          const value = settings as Prisma.InputJsonValue;
          await tx.guild.upsert({
            where: { id: guildId },
            update: { settings: value },
            create: { id: guildId, settings: value },
          });
        },
        { isolationLevel: "Serializable" },
      );
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt === 3) throw error;
    }
  }
}

export async function setGuildSetting(
  guildId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await mutateSettings(guildId, (settings) => {
    settings[key] = value;
  });
}

export async function deleteGuildSetting(
  guildId: string,
  key: string,
): Promise<void> {
  await mutateSettings(guildId, (settings) => {
    delete settings[key];
  });
}

export async function setGuildSettings(
  guildId: string,
  values: GuildSettings,
): Promise<void> {
  await mutateSettings(guildId, (settings) => {
    Object.assign(settings, values);
  });
}
