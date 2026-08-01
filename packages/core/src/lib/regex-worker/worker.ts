/**
 * Regex evaluation worker. Guild-supplied patterns are catastrophic-backtracking
 * bait, so they run here instead of on the bot's event loop: a pattern that hangs
 * only hangs this thread, and the parent kills and respawns it.
 *
 * Runs standalone - it must not import anything from the bot.
 */
import { parentPort } from "node:worker_threads";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

/** Pattern sets are keyed by `<guildId>:<version>`; bounded, oldest evicted. */
const MAX_SETS = 2_000;

const sets = new Map<string, RegExp[]>();

const port = parentPort;
if (!port) throw new Error("regex-worker must be started as a worker thread");

function reply(message: WorkerResponse): void {
  port!.postMessage(message);
}

function compile(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      out.push(new RegExp(pattern, "iu"));
    } catch {
      // Parent already rejects invalid patterns; skip rather than kill the set.
    }
  }
  return out;
}

function store(key: string, patterns: string[]): void {
  sets.delete(key);
  sets.set(key, compile(patterns));
  while (sets.size > MAX_SETS) {
    const oldest = sets.keys().next().value;
    if (oldest === undefined) break;
    sets.delete(oldest);
  }
}

/** Index of the first matching regex, announcing each one before running it. */
function firstMatch(id: number, regexes: RegExp[], content: string): number | null {
  for (let i = 0; i < regexes.length; i++) {
    reply({ kind: "progress", id, index: i });
    const regex = regexes[i]!;
    regex.lastIndex = 0;
    if (regex.test(content)) return i;
  }
  return null;
}

reply({ kind: "ready" });

port.on("message", (msg: WorkerRequest) => {
  switch (msg.kind) {
    case "load":
      store(msg.key, msg.patterns);
      return;

    case "test": {
      const regexes = sets.get(msg.key);
      if (!regexes) {
        reply({ kind: "unknown", id: msg.id, key: msg.key });
        return;
      }
      reply({ kind: "result", id: msg.id, index: firstMatch(msg.id, regexes, msg.content) });
      return;
    }

    case "probe": {
      let regex: RegExp;
      try {
        regex = new RegExp(msg.pattern, "iu");
      } catch {
        reply({ kind: "result", id: msg.id, index: null });
        return;
      }
      for (const input of msg.inputs) {
        regex.lastIndex = 0;
        regex.test(input);
      }
      reply({ kind: "result", id: msg.id, index: null });
      return;
    }
  }
});
