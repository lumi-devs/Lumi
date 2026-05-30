// Wraps a command piece's run methods so each invocation gets: a request context
// (correlation id + guild/user, picked up by the logger), an active OTel span that
// child DB/Redis/HTTP spans nest under, and RED metrics (rate + errors + duration).
//
// Wrapping the run method — rather than listening for *CommandRun events — is what
// keeps the span ACTIVE across the handler's awaits, so the whole command is one
// connected trace.

import { randomUUID } from "node:crypto";
import { SpanKind } from "@opentelemetry/api";
import {
  commandDuration,
  commandsTotal,
  runWithContext,
  withSpan,
} from "@lumi/observability";

type RunMethod = "chatInputRun" | "messageRun" | "contextMenuRun";

const TYPE_LABEL: Record<RunMethod, string> = {
  chatInputRun: "chat",
  messageRun: "message",
  contextMenuRun: "context",
};

interface IdSource {
  guildId?: unknown;
  guild?: { id?: string } | null;
  user?: { id?: string };
  author?: { id?: string };
}

function extractIds(source: unknown): { guildId?: string; userId?: string } {
  if (!source || typeof source !== "object") return {};
  const s = source as IdSource;
  const guildId =
    typeof s.guildId === "string" ? s.guildId : (s.guild?.id ?? undefined);
  const userId = s.user?.id ?? s.author?.id;
  return { guildId, userId };
}

async function instrumentedRun(
  command: string,
  type: string,
  source: unknown,
  exec: () => unknown,
): Promise<unknown> {
  const { guildId, userId } = extractIds(source);
  const stop = commandDuration.startTimer({ command, type });

  return runWithContext(
    {
      correlationId: randomUUID(),
      source: "command",
      name: command,
      guildId,
      userId,
    },
    () =>
      withSpan(
        `command ${command}`,
        async (span) => {
          span.setAttribute("lumi.command", command);
          span.setAttribute("lumi.command.type", type);
          if (guildId) span.setAttribute("discord.guild.id", guildId);
          if (userId) span.setAttribute("discord.user.id", userId);
          try {
            const result = await exec();
            commandsTotal.inc({ command, type, status: "success" });
            return result;
          } catch (err) {
            commandsTotal.inc({ command, type, status: "error" });
            throw err;
          } finally {
            stop();
          }
        },
        { kind: SpanKind.SERVER },
      ),
  );
}

/** Shadow the piece's run methods with instrumented wrappers. Call once, in the base ctor. */
export function instrumentCommandPiece(piece: { name: string }): void {
  const target = piece as Record<string, unknown> & { name: string };
  for (const method of [
    "chatInputRun",
    "messageRun",
    "contextMenuRun",
  ] as RunMethod[]) {
    const original = target[method];
    if (typeof original !== "function") continue;
    const fn = original as (...args: unknown[]) => unknown;
    Object.defineProperty(target, method, {
      configurable: true,
      writable: true,
      value(this: unknown, source: unknown, ...rest: unknown[]) {
        return instrumentedRun(piece.name, TYPE_LABEL[method], source, () =>
          fn.call(this, source, ...rest),
        );
      },
    });
  }
}
