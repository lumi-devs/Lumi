import { type RequestHandler, redirect } from "@sveltejs/kit";
import { authorizeUrl, createPkce, randomState } from "#lib/server/discord.js";
import { serverConfig } from "#lib/server/env.js";
import { dashboardKey, getRedis } from "#lib/server/redis.js";
import { safeReturnTo } from "#lib/server/returnTo.js";

const OAuthStateCookie = "lumi_oauth_state";

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

  throw redirect(303, authorizeUrl(state, challenge), {
    external: ["https://discord.com"],
  });
};
