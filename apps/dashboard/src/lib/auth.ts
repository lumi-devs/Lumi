import "server-only";
import NextAuth, { type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Discord from "next-auth/providers/discord";
import { env } from "./env";
import { canManage, fetchUserGuilds, userAvatarUrl, type OAuthGuild } from "./discord";
import { rpcCall } from "./rpc";
import { RPC_ACTIONS, type WhoAmIResponse } from "@lumi/contracts";

interface DiscordRawProfile {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
  global_name?: string | null;
}

// How stale `guilds`/`isBotOwner` may get: a revoked Manage Server takes effect
// within this window rather than lasting the full 8h session.
const AUTHZ_TTL_MS = 5 * 60 * 1000;

interface AuthzSnapshot {
  at: number;
  guilds?: OAuthGuild[];
  isBotOwner?: boolean;
}

// A Server Component render can't write the mutated JWT back to the cookie, so
// `authRefreshedAt` alone would let every page view re-fetch. This process-local
// snapshot is what actually bounds the outbound traffic.
const authzCache = new Map<string, AuthzSnapshot>();

async function refreshAuthorization(token: JWT): Promise<void> {
  const userId = token.userId ?? "";
  const cached = authzCache.get(userId);
  if (cached && Date.now() - cached.at < AUTHZ_TTL_MS) {
    if (cached.guilds) token.guilds = cached.guilds;
    if (cached.isBotOwner !== undefined) token.isBotOwner = cached.isBotOwner;
    token.authRefreshedAt = cached.at;
    return;
  }

  // Published before the awaits so concurrent renders don't stampede, and so a
  // persistently failing Discord/worker can't turn every request into a retry.
  const snapshot: AuthzSnapshot = {
    at: Date.now(),
    guilds: token.guilds,
    isBotOwner: token.isBotOwner,
  };
  authzCache.set(userId, snapshot);
  token.authRefreshedAt = snapshot.at;
  for (const [key, entry] of authzCache) {
    if (snapshot.at - entry.at > AUTHZ_TTL_MS) authzCache.delete(key);
  }

  try {
    const whoami = (await rpcCall(RPC_ACTIONS.authWhoAmI, {
      actorId: userId,
    })) as WhoAmIResponse;
    token.isBotOwner = whoami.isBotOwner;
    snapshot.isBotOwner = whoami.isBotOwner;
  } catch {
    // Keep the previous value: clobbering it to `false` would lock a real bot
    // owner out of /system until the session expires.
  }
  try {
    const guilds = (await fetchUserGuilds(token.accessToken ?? "")).filter(canManage);
    token.guilds = guilds;
    snapshot.guilds = guilds;
  } catch {
    // Likewise: an empty list would 404 every guild route until a manual sign-out.
  }
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
  // Always deployed behind a reverse proxy; without this NextAuth throws
  // `UntrustedHost` instead of trusting the forwarded Host header.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // `account`/`profile` are only present on the initial sign-in callback.
      if (account && profile) {
        const raw = profile as unknown as DiscordRawProfile;
        token.userId = raw.id;
        token.username = raw.username;
        token.avatar = raw.avatar ?? "";
        token.accessToken = account.access_token ?? "";
        await refreshAuthorization(token);
        return token;
      }
      if (Date.now() - (token.authRefreshedAt ?? 0) > AUTHZ_TTL_MS) {
        await refreshAuthorization(token);
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
      session.avatar = userAvatarUrl(token.userId ?? "", token.avatar);
      session.guilds = token.guilds ?? [];
      session.isBotOwner = token.isBotOwner ?? false;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
