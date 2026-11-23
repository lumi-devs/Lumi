import { json } from "@sveltejs/kit";
import { getPrisma } from "#lib/server/prisma.js";
import { getRedis } from "#lib/server/redis.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const checks: Record<string, boolean> = {};

  try {
    checks.redis = (await getRedis().ping()) === "PONG";
  } catch {
    checks.redis = false;
  }

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }

  const ok = Object.values(checks).every(Boolean);
  return json({ ok, checks }, { status: ok ? 200 : 503 });
};
