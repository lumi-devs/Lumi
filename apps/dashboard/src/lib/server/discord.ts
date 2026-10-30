import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { serverConfig } from "./env";

const ApiBase = "https://discord.com/api/v10";
const OAuthBase = "https://discord.com/oauth2/authorize";
const TokenUrl = `${ApiBase}/oauth2/token`;

export const ManageGuildPermission = 1n << 5n;
export const AdministratorPermission = 1n << 3n;

const OAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

export type OAuthToken = z.infer<typeof OAuthTokenSchema>;

const OAuthUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export type OAuthUser = z.infer<typeof OAuthUserSchema>;

const GuildSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner: z.boolean().optional(),
  permissions: z.string().optional(),
});

export type GuildSummary = z.infer<typeof GuildSummarySchema>;

const GuildDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner_id: z.string().optional(),
});

export type GuildDetail = z.infer<typeof GuildDetailSchema>;

const BotUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

export type BotUser = z.infer<typeof BotUserSchema>;

const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().optional(),
  position: z.number().optional(),
});

export type DiscordRole = z.infer<typeof RoleSchema>;

export class DiscordError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = "") {
    super(message);
    this.name = "DiscordError";
    this.status = status;
    this.body = body;
  }
}

export function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function randomState(): string {
  return base64Url(randomBytes(32));
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string): string {
  const config = serverConfig();
  const url = new URL(OAuthBase);
  url.searchParams.set("client_id", config.discordClientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function tokenRequest(params: URLSearchParams): Promise<OAuthToken> {
  const response = await fetch(TokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(15_000),
  }).catch((error: unknown) => {
    throw new DiscordError(
      `Discord token request failed: ${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  });

  if (!response.ok) {
    throw new DiscordError(
      "Discord rejected the OAuth token request.",
      response.status,
      (await response.text()).slice(0, 500),
    );
  }

  const parsed = OAuthTokenSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new DiscordError("Discord returned an invalid token response.", 502);
  }
  return parsed.data;
}

export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<OAuthToken> {
  const config = serverConfig();
  return tokenRequest(
    new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  );
}

export async function refreshOAuthToken(
  refreshToken: string,
): Promise<OAuthToken> {
  const config = serverConfig();
  return tokenRequest(
    new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

async function oauthGet<T>(
  path: string,
  accessToken: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${ApiBase}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new DiscordError(
      "Discord user API request failed.",
      response.status,
      (await response.text()).slice(0, 500),
    );
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new DiscordError("Discord returned an invalid response.", 502);
  }
  return parsed.data;
}

export function fetchOAuthUser(accessToken: string): Promise<OAuthUser> {
  return oauthGet("/users/@me", accessToken, OAuthUserSchema);
}

export async function fetchUserGuilds(
  accessToken: string,
): Promise<GuildSummary[]> {
  const response = await fetch(`${ApiBase}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new DiscordError(
      "Could not load your Discord servers.",
      response.status,
      (await response.text()).slice(0, 500),
    );
  }

  const parsed = z.array(GuildSummarySchema).safeParse(await response.json());
  if (!parsed.success) {
    throw new DiscordError("Discord returned an invalid guild list.", 502);
  }
  return parsed.data;
}

export function canManageGuild(guild: GuildSummary): boolean {
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions ?? "0");
    return (
      (permissions & ManageGuildPermission) === ManageGuildPermission ||
      (permissions & AdministratorPermission) === AdministratorPermission
    );
  } catch {
    return false;
  }
}

async function botRequest<T>(
  path: string,
  init: RequestInit = {},
  schema?: z.ZodType<T>,
): Promise<T | null> {
  const response = await fetch(`${ApiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${serverConfig().botToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new DiscordError(
      "Discord bot API request failed.",
      response.status,
      (await response.text()).slice(0, 500),
    );
  }
  if (response.status === 204) return null;

  const json: unknown = await response.json();
  if (!schema) return json as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new DiscordError("Discord returned an invalid response.", 502);
  }
  return parsed.data;
}

export async function fetchBotGuild(
  guildId: string,
): Promise<GuildDetail | null> {
  return botRequest(
    `/guilds/${encodeURIComponent(guildId)}`,
    {},
    GuildDetailSchema,
  );
}

export async function fetchBotUser(userId: string): Promise<BotUser | null> {
  return botRequest(`/users/${encodeURIComponent(userId)}`, {}, BotUserSchema);
}

export async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const roles = await botRequest(
    `/guilds/${encodeURIComponent(guildId)}/roles`,
    {},
    z.array(RoleSchema),
  );
  return roles ?? [];
}

function auditReason(reason: string | undefined): Record<string, string> {
  if (!reason) return {};
  return { "x-audit-log-reason": encodeURIComponent(reason.slice(0, 400)) };
}

export async function addMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason?: string,
): Promise<void> {
  await botRequest(
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    { method: "PUT", headers: auditReason(reason) },
  );
}

export async function removeMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason?: string,
): Promise<void> {
  await botRequest(
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    { method: "DELETE", headers: auditReason(reason) },
  );
}

export function userAvatarUrl(
  userId: string,
  avatar: string | null | undefined,
): string | null {
  if (!avatar) return null;
  const extension = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${extension}?size=64`;
}

export function guildIconUrl(
  guildId: string,
  icon: string | null | undefined,
): string | null {
  if (!icon) return null;
  const extension = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${extension}?size=96`;
}
