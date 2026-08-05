import "server-only";
import NextAuth, { type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Discord from "next-auth/providers/discord";
import { env } from "./env";
import { canManage, fetchUserGuilds } from "./discord";
import { rpcCall } from "./rpc";
import { RPC_ACTIONS, type WhoAmIResponse } from "@lumi/contracts";

// Auth.js (NextAuth v5) replaces the old hand-rolled HMAC-signed session
// cookie + in-memory session Map (apps/dashboard/src/sessions.ts) and the
// manual OAuth2 state-param dance (apps/dashboard/src/discord.ts
// `authorizeUrl` + server.ts `/callback`). NextAuth's Discord provider
// handles the authorization redirect, PKCE/state CSRF protection, and code
// exchange; sessions are signed+encrypted JWTs (`AUTH_SECRET`, mapped from
// the deploy-config `DASHBOARD_SESSION_SECRET` var — see lib/env.ts).
//
// Scope is `identify guilds` (same as before) so the `guilds` list can be
// fetched and permission-filtered at sign-in time.

interface DiscordRawProfile {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
  global_name?: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: env.discordClientId,
      clientSecret: env.discordClientSecret,
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  secret: env.authSecret,
  // Runs behind a reverse proxy / container port mapping in every real
  // deployment (see docker-compose.yml's `dashboard` service) rather than
  // being reachable on a fixed, known host — without this, NextAuth throws
  // `UntrustedHost` on every request instead of trusting the proxy's
  // forwarded Host header.
  trustHost: true,
  session: {
    strategy: "jwt",
    // Matches the old dashboard's SESSION_TTL_MS (8 hours).
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Only runs on initial sign-in, when Discord's OAuth2 response is present.
      if (account && profile) {
        const raw = profile as unknown as DiscordRawProfile;
        token.userId = raw.id;
        token.username = raw.username;
        token.avatar = raw.avatar ?? "";
        try {
          // Defers to the worker's `PermitResolver.isBotOwner`, which
          // recognizes the Discord application's actual owner as well as
          // `OWNER_IDS` — no separate dashboard-side owner list to keep in
          // sync.
          const whoami = (await rpcCall(RPC_ACTIONS.authWhoAmI, {
            actorId: raw.id,
          })) as WhoAmIResponse;
          token.isBotOwner = whoami.isBotOwner;
        } catch {
          // Worker unreachable at sign-in shouldn't hard-fail login — just
          // re-checked on next re-auth, and every Bot Owner Server Action
          // re-validates against the worker independently anyway.
          token.isBotOwner = false;
        }
        try {
          const guilds = await fetchUserGuilds(account.access_token ?? "");
          token.guilds = guilds.filter(canManage);
        } catch {
          // Discord API hiccup at sign-in shouldn't hard-fail login — the
          // guild list just re-populates on next re-auth. Guild-scoped
          // routes still enforce authorizedGuild() with whatever is cached.
          token.guilds = [];
        }
      }
      return token;
    },
    session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }) {
      session.userId = token.userId ?? "";
      session.username = token.username ?? "";
      session.avatar = token.avatar ?? "";
      session.guilds = token.guilds ?? [];
      session.isBotOwner = token.isBotOwner ?? false;
      return session;
    },
  },
  pages: {
    // Custom branded page instead of NextAuth's default (see app/login/page.tsx).
    signIn: "/login",
  },
});
