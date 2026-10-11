import { Prisma } from "@prisma/client";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";

export type RankAccountTable = "economy_accounts" | "level_accounts";

export interface AccountRankRow {
  userId: string;
  rank: number;
  fullCount: number;
  [column: string]: unknown;
}

export async function rankedAccountPage(
  prisma: DatabaseClient,
  table: RankAccountTable,
  scoreColumn: string,
  extraColumns: string,
  guildId: string,
  limit: number,
  offset: number,
): Promise<AccountRankRow[]> {
  return prisma.$queryRaw<AccountRankRow[]>(Prisma.sql`
    SELECT "user_id" AS "userId", ${Prisma.raw(extraColumns)},
      RANK() OVER (ORDER BY ${Prisma.raw(scoreColumn)} DESC, "user_id" ASC) AS "rank",
      COUNT(*) OVER () AS "fullCount"
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "guild_id" = ${guildId}
    ORDER BY "rank" ASC, "userId" ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
}

export async function rankPosition(
  prisma: DatabaseClient,
  table: RankAccountTable,
  scoreColumn: string,
  guildId: string,
  userId: string,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ rank: number; exists: boolean }[]>(
    Prisma.sql`
      WITH mine AS (
        SELECT ${Prisma.raw(scoreColumn)} AS "score"
        FROM ${Prisma.raw(`"${table}"`)}
        WHERE "guild_id" = ${guildId} AND "user_id" = ${userId}
      )
      SELECT COUNT(*) + 1 AS "rank",
        EXISTS (
          SELECT 1 FROM ${Prisma.raw(`"${table}"`)}
          WHERE "guild_id" = ${guildId} AND "user_id" = ${userId}
        ) AS "exists"
      FROM ${Prisma.raw(`"${table}"`)} AS a, mine AS m
      WHERE a."guild_id" = ${guildId}
        AND (a.${Prisma.raw(scoreColumn)} > m."score"
          OR (a.${Prisma.raw(scoreColumn)} = m."score" AND a."user_id" < ${userId}))
    `,
  );
  if (!rows[0]?.exists) return null;
  return Number(rows[0].rank);
}

export interface GainWindowRow {
  userId: string;
  total: number;
  rank: number;
  fullCount: number;
}

export async function rankedGainWindow(
  prisma: DatabaseClient,
  guildId: string,
  since: Date,
  limit: number,
  offset: number,
): Promise<GainWindowRow[]> {
  return prisma.$queryRaw<GainWindowRow[]>(Prisma.sql`
    SELECT "user_id" AS "userId", SUM("amount") AS "total",
      RANK() OVER (ORDER BY SUM("amount") DESC, "user_id" ASC) AS "rank",
      COUNT(*) OVER () AS "fullCount"
    FROM "level_xp_gains"
    WHERE "guild_id" = ${guildId} AND "created_at" >= ${since}
    GROUP BY "user_id"
    ORDER BY "total" DESC, "userId" ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
}
