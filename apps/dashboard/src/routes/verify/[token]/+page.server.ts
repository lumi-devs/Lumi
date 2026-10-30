import type { PageServerLoad, Actions } from "./$types";
import { createHash, randomBytes } from "node:crypto";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "$lib/server/audit";
import {
  addMemberRole,
  fetchBotUser,
  fetchGuildRoles,
  guildIconUrl,
  removeMemberRole,
  userAvatarUrl,
  type DiscordRole,
} from "$lib/server/discord";
import { getPrisma } from "$lib/server/prisma";
import { dashboardKey, getRedis } from "$lib/server/redis";
import { readGuildSettings } from "$lib/server/settings";

const TokenRe = /^[A-Za-z0-9_-]{20,200}$/;
const CaptchaTtlSeconds = 600;
const RateLimitWindowSeconds = 600;
const RateLimitMax = 20;

const VerificationSettingsSchema = z.object({
  verifiedRoleId: z.string().nullable().default(null),
  pendingRoleId: z.string().nullable().default(null),
});

const CaptchaSchema = z.object({
  tokenHash: z.string(),
  answer: z.number(),
});

type PageState = "ready" | "invalid" | "used" | "expired" | "misconfigured";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueCaptcha(tokenHash: string): Promise<{
  nonce: string;
  question: string;
}> {
  const nonce = randomBytes(24).toString("base64url");
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 1 + Math.floor(Math.random() * 8);
  await getRedis().set(
    dashboardKey("captcha", nonce),
    JSON.stringify({ tokenHash, answer: left + right }),
    "EX",
    CaptchaTtlSeconds,
  );
  return { nonce, question: `${left} + ${right}` };
}

async function loadToken(token: string) {
  if (!TokenRe.test(token)) return { state: "invalid" as const, row: null };
  const tokenHash = hashToken(token);
  const row = await getPrisma().verificationToken.findUnique({
    where: { tokenHash },
  });
  if (!row) return { state: "invalid" as const, row: null };
  if (row.usedAt) return { state: "used" as const, row };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { state: "expired" as const, row };
  }
  return { state: "ready" as const, row };
}

async function verificationSettings(guildId: string) {
  const settings = await readGuildSettings(guildId);
  const raw = settings["security-verification"];
  const parsed = VerificationSettingsSchema.safeParse(
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {},
  );
  return parsed.success
    ? parsed.data
    : { verifiedRoleId: null, pendingRoleId: null };
}

function roleName(roles: DiscordRole[], roleId: string | null): string | null {
  if (!roleId) return null;
  return roles.find((role) => role.id === roleId)?.name ?? null;
}

export const load: PageServerLoad = async (event) => {
  const token = event.params.token ?? "";
  const loaded = await loadToken(token);

  if (loaded.state !== "ready" || !loaded.row) {
    return {
      state: loaded.state as PageState,
      token: null,
      captcha: null,
      guild: null,
      user: null,
      roles: { verified: null, pending: null, verifiedId: null },
    };
  }

  const row = loaded.row;
  const [guild, user, settings, roles] = await Promise.all([
    getPrisma().guild.findUnique({
      where: { id: row.guildId },
      select: { id: true, name: true, icon: true },
    }),
    fetchBotUser(row.userId).catch(() => null),
    verificationSettings(row.guildId),
    fetchGuildRoles(row.guildId).catch(() => [] as DiscordRole[]),
  ]);

  const state: PageState = settings.verifiedRoleId ? "ready" : "misconfigured";
  const captcha =
    state === "ready" ? await issueCaptcha(hashToken(token)) : null;

  return {
    state,
    token: {
      id: row.id,
      guildId: row.guildId,
      userId: row.userId,
      expiresAt: row.expiresAt.toISOString(),
    },
    captcha,
    guild: {
      id: row.guildId,
      name: guild?.name || `Server ${row.guildId}`,
      iconUrl: guildIconUrl(row.guildId, guild?.icon),
    },
    user: {
      id: row.userId,
      username: user?.global_name || user?.username || `User ${row.userId}`,
      avatarUrl: userAvatarUrl(row.userId, user?.avatar),
    },
    roles: {
      verifiedId: settings.verifiedRoleId,
      verified: roleName(roles, settings.verifiedRoleId),
      pending: roleName(roles, settings.pendingRoleId),
    },
  };
};

export const actions: Actions = {
  default: async (event) => {
    const token = event.params.token ?? "";
    const data = await event.request.formData();

    const ip = event.getClientAddress();
    const rateKey = dashboardKey(
      "verify-rate",
      createHash("sha256").update(ip).digest("hex"),
    );
    const attempts = await getRedis().incr(rateKey);
    if (attempts === 1) {
      await getRedis().expire(rateKey, RateLimitWindowSeconds);
    }
    if (attempts > RateLimitMax) {
      return fail(429, {
        error: "Too many verification attempts. Wait a few minutes.",
      });
    }

    const loaded = await loadToken(token);
    if (loaded.state === "invalid" || !loaded.row) {
      return fail(400, { error: "This verification link is invalid." });
    }
    if (loaded.state === "used") {
      return fail(400, { error: "This verification link was already used." });
    }
    if (loaded.state === "expired") {
      return fail(400, { error: "This verification link has expired." });
    }

    const row = loaded.row;
    const settings = await verificationSettings(row.guildId);
    if (!settings.verifiedRoleId) {
      return fail(503, {
        error:
          "Verification is not fully configured. Ask a server admin to set the verified role.",
      });
    }

    const nonce = String(data.get("nonce") ?? "");
    const answerRaw = String(data.get("answer") ?? "").trim();
    const answer = Number(answerRaw);
    if (!nonce || !answerRaw || !Number.isInteger(answer)) {
      return fail(400, { error: "Enter the answer to the math question." });
    }

    const captchaKey = dashboardKey("captcha", nonce);
    const rawCaptcha = await getRedis().get(captchaKey);
    await getRedis().del(captchaKey);
    if (!rawCaptcha) {
      return fail(400, {
        error: "The captcha expired. Submit the form again.",
      });
    }

    let captcha: z.infer<typeof CaptchaSchema>;
    try {
      const parsed = CaptchaSchema.safeParse(JSON.parse(rawCaptcha));
      if (!parsed.success) {
        return fail(400, { error: "The captcha was invalid. Try again." });
      }
      captcha = parsed.data;
    } catch {
      return fail(400, { error: "The captcha was invalid. Try again." });
    }

    if (captcha.tokenHash !== hashToken(token) || captcha.answer !== answer) {
      return fail(400, {
        error: "That answer is not correct. Try the new question.",
      });
    }

    try {
      await addMemberRole(
        row.guildId,
        row.userId,
        settings.verifiedRoleId,
        "Verification completed on the Lumi dashboard",
      );
    } catch (error) {
      console.error("[dashboard] verification role grant failed", error);
      return fail(502, {
        error:
          "The verified role could not be assigned. Check the bot's role hierarchy and permissions, then try again.",
      });
    }

    if (
      settings.pendingRoleId &&
      settings.pendingRoleId !== settings.verifiedRoleId
    ) {
      await removeMemberRole(
        row.guildId,
        row.userId,
        settings.pendingRoleId,
        "Verification completed",
      ).catch((error: unknown) => {
        console.warn("[dashboard] pending role removal failed", error);
      });
    }

    const marked = await getPrisma().verificationToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (marked.count === 0) {
      return fail(409, {
        error: "This verification link was already used.",
      });
    }

    await getRedis()
      .del(`lumi:security:verification:pending:${row.guildId}:${row.userId}`)
      .catch(() => undefined);
    await getRedis()
      .srem(`lumi:security:verification:pending-set:${row.guildId}`, row.userId)
      .catch(() => undefined);

    await recordAudit({
      guildId: row.guildId,
      userId: row.userId,
      action: "dashboard.verification.complete",
      targetId: row.id,
      targetType: "verification_token",
    });

    return {
      success: "Verification complete. You now have access to the server.",
    };
  },
};
