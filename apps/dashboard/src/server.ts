// / <reference types="bun-types" />
import { RPC_ACTIONS } from "@lumi/contracts";
import { config } from "./config.js";
import type { RpcClient } from "./rpc.js";
import {
  authorizeUrl,
  canManage,
  exchangeCode,
  getUser,
  getUserGuilds,
  userAvatarUrl,
} from "./discord.js";
import {
  clearSessionCookie,
  clearStateCookie,
  createSession,
  destroySession,
  issueState,
  readSession,
  sessionCookie,
  verifyState,
} from "./sessions.js";
import {
  guildConfigPage,
  guildPicker,
  inviteNeededPage,
  loginPage,
} from "./views.js";
import type { DashboardData, Session } from "./types.js";

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });

const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, ...headers },
  });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Confirm the session can manage this guild (defends every guild-scoped route). */
function authorizedGuild(session: Session, guildId: string): boolean {
  return session.guilds.some((g) => g.id === guildId && canManage(g));
}

/** Reject cross-origin state-changing requests (defence-in-depth CSRF guard). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser / same-origin fetch without Origin
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function createServer(rpc: RpcClient) {
  return Bun.serve({
    hostname: config.host,
    port: config.port,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const cookies = req.headers.get("cookie");
      const session = readSession(cookies);

      // ── Auth routes ──────────────────────────────────────────────────────
      if (path === "/login") {
        const { state, cookie } = issueState();
        return redirect(authorizeUrl(state), { "Set-Cookie": cookie });
      }

      if (path === "/logout") {
        destroySession(cookies);
        return redirect("/", { "Set-Cookie": clearSessionCookie() });
      }

      if (path === "/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !verifyState(cookies, state))
          return html(loginPage(), { "Set-Cookie": clearStateCookie() });
        try {
          const accessToken = await exchangeCode(code);
          const [user, guilds] = await Promise.all([
            getUser(accessToken),
            getUserGuilds(accessToken),
          ]);
          const id = createSession({
            userId: user.id,
            username: user.username,
            avatar: userAvatarUrl(user),
            accessToken,
            guilds: guilds.filter(canManage),
          });
          return redirect("/", {
            "Set-Cookie": sessionCookie(id),
          });
        } catch {
          return html(loginPage());
        }
      }

      // ── Everything below requires a session ──────────────────────────────
      if (!session) {
        if (path === "/") return html(loginPage());
        return redirect("/");
      }

      if (path === "/") return html(guildPicker(session, session.guilds));

      // ── Guild config page ────────────────────────────────────────────────
      const guildMatch = /^\/guild\/(\d{17,20})$/.exec(path);
      if (guildMatch && req.method === "GET") {
        const guildId = guildMatch[1]!;
        if (!authorizedGuild(session, guildId)) return redirect("/");
        try {
          const data = (await rpc.call(RPC_ACTIONS.guildDashboardGet, {
            guildId,
            actorId: session.userId,
          })) as DashboardData;
          return html(guildConfigPage(session, guildId, data));
        } catch {
          return html(inviteNeededPage(session, guildId));
        }
      }

      // ── Mutations (JSON API) ─────────────────────────────────────────────
      const apiMatch = /^\/api\/guild\/(\d{17,20})\/(config|module)$/.exec(
        path,
      );
      if (apiMatch && req.method === "POST") {
        if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
        const guildId = apiMatch[1]!;
        const kind = apiMatch[2]!;
        if (!authorizedGuild(session, guildId))
          return json({ error: "Forbidden" }, 403);

        let payload: Record<string, unknown>;
        try {
          payload = (await req.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        try {
          if (kind === "module") {
            await rpc.call(RPC_ACTIONS.guildModuleToggle, {
              guildId,
              actorId: session.userId,
              data: {
                moduleName: String(payload.moduleName),
                enabled: Boolean(payload.enabled),
              },
            });
          } else {
            await rpc.call(RPC_ACTIONS.guildConfigSet, {
              guildId,
              actorId: session.userId,
              data: {
                moduleName: String(payload.moduleName),
                key: String(payload.key),
                value: payload.value,
              },
            });
          }
          return json({ ok: true });
        } catch (err) {
          return json(
            { error: err instanceof Error ? err.message : "RPC failed" },
            502,
          );
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });
}
