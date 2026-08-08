import type { OAuthGuild } from "#/lib/discord";

// Both the "next-auth/*" and "@auth/core/*" module paths are augmented below.
// next-auth v5 declares `Session`/`JWT` in @auth/core and wildcard re-exports
// them; `declare module` merging doesn't follow through a wildcard re-export,
// so augmenting only "next-auth/jwt" silently no-ops and `token.foo` types as
// `{}`. The @auth/core augmentation is the one that merges; the next-auth one
// is kept because that's the path application code imports from.

interface SessionExtras {
  userId: string;
  username: string;
  avatar: string;
  /** Pre-filtered at sign-in to guilds where the user holds Manage Server. */
  guilds: OAuthGuild[];
  isBotOwner: boolean;
}

interface JwtExtras {
  userId?: string;
  username?: string;
  avatar?: string;
  guilds?: OAuthGuild[];
  isBotOwner?: boolean;
  accessToken?: string;
  /** Epoch ms of the last `guilds`/`isBotOwner` refresh attempt. */
  authRefreshedAt?: number;
}

declare module "next-auth" {
  interface Session extends SessionExtras {}
}
declare module "@auth/core/types" {
  interface Session extends SessionExtras {}
}

declare module "next-auth/jwt" {
  interface JWT extends JwtExtras {}
}
declare module "@auth/core/jwt" {
  interface JWT extends JwtExtras {}
}
