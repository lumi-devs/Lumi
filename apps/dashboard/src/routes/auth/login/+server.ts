import { redirect, type RequestHandler } from "@sveltejs/kit";
import { authorizeUrl, createPkce, randomState } from "$lib/server/discord";
import { dashboardKey, getRedis } from "$lib/server/redis";
import { serverConfig } from "$lib/server/env";

const OAuthStateCookie = "lumi_oauth_state";

function safeReturnTo(value: string | null): string {
  if (
    value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value.slice(0, 500);
  }
  return "/guilds";
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  const state = randomState();
  const { verifier, challenge } = createPkce();
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  await getRedis().set(
    dashboardKey("oauth", state),
    JSON.stringify({ verifier, returnTo }),
    "EX",
    600,
  );

  cookies.set(OAuthStateCookie, state, {
    path: "/auth",
    httpOnly: true,
    sameSite: "lax",
    secure: serverConfig().cookieSecure,
    maxAge: 600,
  });

  throw redirect(303, authorizeUrl(state, challenge));
};
