import "server-only";
import { redirect, notFound } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "./auth";
import { canManage } from "./discord";

/**
 * Server-side IDOR guard — dashboard.md §5B. Re-verified on every guild-
 * scoped Server Component render and every guild-scoped Server Action, never
 * trusted from client state, so changing `/guild/101` to `/guild/999` in the
 * address bar (or crafting a direct Server Action call) can't read or write
 * a server the caller doesn't manage.
 */
export function authorizedGuild(session: Session, guildId: string): boolean {
  return session.guilds.some((g) => g.id === guildId && canManage(g));
}

/** Require a signed-in session; redirects to /login otherwise. Use in Server Components. */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session) redirect("/login");
  return session;
}

/** Require a signed-in session with Manage Server on `guildId`; 404s otherwise (never leaks existence via 403). */
export async function requireGuild(guildId: string): Promise<Session> {
  const session = await requireSession();
  if (!authorizedGuild(session, guildId)) notFound();
  return session;
}

/** Require a signed-in Bot Owner session — dashboard.md §5 "Bot Owner Privilege Escalation" mitigation. */
export async function requireBotOwner(): Promise<Session> {
  const session = await requireSession();
  if (!session.isBotOwner) notFound();
  return session;
}
