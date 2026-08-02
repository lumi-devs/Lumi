import type { OAuthGuild } from "#/lib/discord";

// Module augmentation: extends NextAuth's Session/JWT shapes with the fields
// the old hand-rolled `Session` interface (apps/dashboard/src/types.ts)
// used to carry — userId, avatar, accessToken, guilds, isBotOwner. NextAuth
// owns issuing/verifying/expiring the session now; we just widen its type.
//
// Both "next-auth"/"next-auth/jwt" AND "@auth/core/types"/"@auth/core/jwt"
// are augmented: next-auth v5's `Session`/`JWT` interfaces are declared in
// @auth/core and merely re-exported (`export * from "@auth/core/jwt"` for
// JWT) from the next-auth subpaths. TypeScript's `declare module` merging
// doesn't reliably follow through a wildcard re-export, so augmenting only
// "next-auth/jwt" silently no-ops and `token.foo` types as `{}` inside
// lib/auth.ts's callbacks. Augmenting the @auth/core source directly is
// what actually merges; the next-auth-path augmentation is kept too since
// that's the module application code imports from.

interface SessionExtras {
  userId: string;
  username: string;
  avatar: string;
  /** Discord OAuth2 access token — used server-side only to refetch guilds. */
  accessToken: string;
  /** Guilds where the user holds Manage Server (or ownership), pre-filtered at sign-in. */
  guilds: OAuthGuild[];
  /** True when `userId` is listed in the `BOT_OWNERS` env var — dashboard.md §8. */
  isBotOwner: boolean;
}

interface JwtExtras {
  userId?: string;
  username?: string;
  avatar?: string;
  accessToken?: string;
  guilds?: OAuthGuild[];
  isBotOwner?: boolean;
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
