import { randomUUID } from "node:crypto";
import type { ModuleServices } from "@lumi/module-kit";

const SessionTtlMs = 15 * 60_000;

export interface TicketOpenSession {
  token: string;
  guildId: string;
  userId: string;
  panelId: string;
  categoryId: string;
  answers: (string | null)[];
  createdAt: string;
}

const memory = new Map<
  string,
  { session: TicketOpenSession; expiresAt: number }
>();

function key(token: string): string {
  return `tickets:open-session:${token}`;
}

function pruneMemory(now = Date.now()): void {
  for (const [token, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(token);
  }
}

export async function createTicketOpenSession(
  services: ModuleServices,
  input: Omit<TicketOpenSession, "token" | "answers" | "createdAt">,
): Promise<TicketOpenSession> {
  pruneMemory();
  const session: TicketOpenSession = {
    ...input,
    token: randomUUID(),
    answers: [],
    createdAt: new Date().toISOString(),
  };
  memory.set(session.token, {
    session,
    expiresAt: Date.now() + SessionTtlMs,
  });
  await services.helpers.cache
    .set(key(session.token), session, SessionTtlMs)
    .catch(() => undefined);
  return session;
}

export async function getTicketOpenSession(
  services: ModuleServices,
  token: string,
): Promise<TicketOpenSession | null> {
  const cached = await services.helpers.cache
    .get<TicketOpenSession>(key(token))
    .catch(() => null);
  if (cached) return cached;
  const entry = memory.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(token);
    return null;
  }
  return entry.session;
}

export async function updateTicketOpenSession(
  services: ModuleServices,
  session: TicketOpenSession,
): Promise<void> {
  memory.set(session.token, {
    session,
    expiresAt: Date.now() + SessionTtlMs,
  });
  await services.helpers.cache
    .set(key(session.token), session, SessionTtlMs)
    .catch(() => undefined);
}

export async function deleteTicketOpenSession(
  services: ModuleServices,
  token: string,
): Promise<void> {
  memory.delete(token);
  await services.helpers.cache.del(key(token)).catch(() => undefined);
}
