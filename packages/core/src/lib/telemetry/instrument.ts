import { randomUUIDv7 } from "bun";
import { SpanKind } from "@opentelemetry/api";
import {
  commandDuration,
  commandsTotal,
  runWithContext,
  withSpan,
} from "@lumi/observability";

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

export async function instrumentedRun(
  command: string,
  type: string,
  source: unknown,
  exec: () => unknown,
): Promise<unknown> {
  const { guildId, userId } = extractIds(source);
  const stop = commandDuration.startTimer({ command, type });

  return runWithContext(
    {
      correlationId: randomUUIDv7(),
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
