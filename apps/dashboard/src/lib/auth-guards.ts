import "server-only";
import { redirect, notFound } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "./auth";
import { canManage } from "./discord";

// IDOR guard: re-derived from the session server-side on every guild-scoped
// render and every guild-scoped Server Action, never trusted from client state.
export function authorizedGuild(session: Session, guildId: string): boolean {
  return session.guilds.some((g) => g.id === guildId && canManage(g));
}

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/login");
  return session;
}

// 404s rather than 403s so an unauthorized caller can't confirm the guild exists.
export async function requireGuild(guildId: string): Promise<Session> {
  const session = await requireSession();
  if (!authorizedGuild(session, guildId)) notFound();
  return session;
}

export async function requireBotOwner(): Promise<Session> {
  const session = await requireSession();
  if (!session.isBotOwner) notFound();
  return session;
}
