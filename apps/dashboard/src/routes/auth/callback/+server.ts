import { redirect, type RequestHandler } from "@sveltejs/kit";
import {
  exchangeCode,
  fetchOAuthUser,
  type OAuthToken,
  type OAuthUser,
} from "$lib/server/discord";
import { serverConfig } from "$lib/server/env";
import { dashboardKey, getRedis } from "$lib/server/redis";
import { createSession, setSessionCookie } from "$lib/server/session";

const OAuthStateCookie = "lumi_oauth_state";

interface StatePayload {
  verifier: string;
  returnTo: string;
}

function safeReturnTo(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value.slice(0, 500)
    : "/guilds";
}

function fail(reason: string): never {
  throw redirect(303, `/?error=${encodeURIComponent(reason)}`);
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  const discordError = url.searchParams.get("error");
  if (discordError) fail("Discord sign-in was cancelled.");

  const state = url.searchParams.get("state") ?? "";
  const cookieState = cookies.get(OAuthStateCookie) ?? "";
  const code = url.searchParams.get("code") ?? "";

  if (!state || !cookieState || state !== cookieState) {
    fail("The sign-in state did not match. Start again.");
  }
  if (!code) fail("Discord did not return an authorization code.");

  cookies.delete(OAuthStateCookie, { path: "/auth" });

  const key = dashboardKey("oauth", state);
  const raw = await getRedis().get(key);
  await getRedis().del(key);
  if (!raw) fail("The sign-in request expired. Start again.");

  let payload: StatePayload;
  try {
    payload = JSON.parse(raw!) as StatePayload;
  } catch {
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
    console.error("[dashboard] oauth callback failed", error);
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
