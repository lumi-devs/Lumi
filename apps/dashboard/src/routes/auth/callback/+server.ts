import { type RequestHandler, redirect } from "@sveltejs/kit";
import {
  DiscordError,
  exchangeCode,
  fetchOAuthUser,
  type OAuthToken,
  type OAuthUser,
} from "#lib/server/discord.js";
import { serverConfig } from "#lib/server/env.js";
import { dashboardKey, getRedis } from "#lib/server/redis.js";
import { safeReturnTo } from "#lib/server/returnTo.js";
import { createSession, setSessionCookie } from "#lib/server/session.js";

const OAuthStateCookie = "lumi_oauth_state";

interface StatePayload {
  verifier: string;
  returnTo: string;
}

function fail(reason: string): never {
  console.error("[dashboard] oauth fail:", reason);
  throw redirect(303, `/?error=${encodeURIComponent(reason)}`);
}

function validateConfig(): void {
  const cfg = serverConfig();
  if (!cfg.discordClientId || !cfg.discordClientSecret) {
    throw new Error(
      "Discord OAuth credentials not configured. Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.",
    );
  }
  if (cfg.discordClientSecret.length < 10) {
    throw new Error("Discord Client Secret appears invalid (too short).");
  }
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  validateConfig();

  const discordError = url.searchParams.get("error");
  const discordErrorDescription = url.searchParams.get("error_description");
  if (discordError) {
    console.error("[dashboard] Discord returned error:", {
      error: discordError,
      description: discordErrorDescription,
    });
    fail(
      `Discord sign-in failed: ${discordError}${discordErrorDescription ? ` - ${discordErrorDescription}` : ""}`,
    );
  }

  const state = url.searchParams.get("state") ?? "";
  const cookieState = cookies.get(OAuthStateCookie) ?? "";
  const code = url.searchParams.get("code") ?? "";

  if (!state || !cookieState || state !== cookieState) {
    fail("The sign-in state did not match. Start again.");
  }
  if (!code) {
    fail("Discord did not return an authorization code.");
  }

  cookies.delete(OAuthStateCookie, { path: "/auth" });

  const key = dashboardKey("oauth", state);
  const raw = await getRedis().get(key);
  await getRedis().del(key);
  if (!raw) {
    fail("The sign-in request expired. Start again.");
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(raw) as StatePayload;
  } catch (e) {
    console.error("[dashboard] Failed to parse OAuth state payload:", e);
    fail("The sign-in request was invalid. Start again.");
  }

  if (!payload || typeof payload.verifier !== "string") {
    fail("The sign-in request was invalid. Start again.");
  }

  let token: OAuthToken;
  let user: OAuthUser;
  try {
    token = await exchangeCode(code, payload.verifier);
    user = await fetchOAuthUser(token.access_token);
  } catch (error) {
    if (error instanceof DiscordError) {
      console.error("[dashboard] Discord API error:", {
        status: error.status,
        message: error.message,
        body: error.body,
      });
      if (error.status === 401 || error.status === 400) {
        fail(
          "Invalid Discord credentials. Check Client ID and Client Secret in dashboard config.",
        );
      }
    } else {
      console.error("[dashboard] OAuth callback failed:", error);
    }
    fail("Discord sign-in failed. Try again in a moment.");
  }

  const session = await createSession({
    userId: user.id,
    username: user.username,
    displayName: user.global_name ?? user.username,
    avatar: user.avatar ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenExpiresAt: Date.now() + token.expires_in * 1000,
  });

  setSessionCookie(cookies, session.id, serverConfig().cookieSecure);
  throw redirect(303, safeReturnTo(payload.returnTo));
};
