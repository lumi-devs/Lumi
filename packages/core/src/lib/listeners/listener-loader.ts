import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUIDv7 } from "bun";
import type { Client } from "discord.js";
import { runWithContext } from "@lumi/observability";
import type { Container } from "@lumi/lib/services.js";
import {
  addListenerDef,
  type ListenerDef,
} from "./listener-def.js";

interface Emitter {
  on(event: string | symbol, listener: (...args: never[]) => unknown): unknown;
  once(
    event: string | symbol,
    listener: (...args: never[]) => unknown,
  ): unknown;
  off(event: string | symbol, listener: (...args: never[]) => unknown): unknown;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      yield full;
    }
  }
}

function isListenerDef(value: unknown): value is ListenerDef {
  if (typeof value !== "object" || value === null) return false;
  const def = value as ListenerDef;
  return (
    (typeof def.event === "string" || typeof def.event === "symbol") &&
    typeof def.execute === "function"
  );
}

function resolveGuildId(args: unknown[]): string | null {
  const [first] = args as [
    { guildId?: string | null; guild?: { id: string } | null } | undefined,
  ];
  return first?.guildId ?? first?.guild?.id ?? null;
}

async function runDef(
  services: Container,
  def: ListenerDef,
  args: unknown[],
): Promise<unknown> {
  const guildId = def.guildId?.(...args) ?? resolveGuildId(args);
  if (def.module) {
    if (!guildId) return;
    if (!(await services.db.modules.isModuleEnabled(guildId, def.module))) return;
    return runWithContext(
      {
        correlationId: randomUUIDv7(),
        source: "event",
        name: def.name,
        guildId,
      },
      () => def.execute(services, ...args),
    );
  }
  return def.execute(services, ...args);
}

export function attachDefs(
  services: Container,
  client: Client,
  defs: readonly ListenerDef[],
): () => void {
  const emitter = client as unknown as Emitter;
  const detachAll: (() => void)[] = [];
  for (const def of defs) {
    const invoke = (...args: never[]): unknown => runDef(services, def, args);
    if (def.once) emitter.once(def.event, invoke);
    else emitter.on(def.event, invoke);
    detachAll.push(() => {
      emitter.off(def.event, invoke);
      void def.onDetach?.();
    });
  }
  return () => {
    for (const detach of detachAll) detach();
  };
}

export async function attachListeners(
  services: Container,
  client: Client,
  moduleDir: string,
): Promise<() => void> {
  const defs: ListenerDef[] = [];
  for await (const file of walk(join(moduleDir, "listeners"))) {
    const mod = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    for (const value of Object.values(mod)) {
      if (!isListenerDef(value)) continue;
      addListenerDef(value);
      defs.push(value);
    }
  }
  return attachDefs(services, client, defs);
}
