import path from "node:path";
import { stat } from "node:fs/promises";
import type {
  AddonCommandDescriptor,
  AddonInvocation,
  ChildToHost,
  HostToChild,
} from "@lumi/contracts";
import { CommandContext, type AddonCommandDefinition } from "#lib/addon-sandbox/sdk/commands.js";
import {
  InteractionContext,
  type InteractionHandler,
} from "#lib/addon-sandbox/sdk/interactions.js";
import { getTaskHandler, registeredTasks } from "#lib/addon-sandbox/sdk/scheduling.js";
import { getEventHandler, registeredEvents } from "#lib/addon-sandbox/sdk/events.js";
import { settleRpc, withInvocation } from "#lib/addon-sandbox/sdk/rpc.js";

const addonName = process.env.LUMI_ADDON_NAME;
const addonDir = process.env.LUMI_ADDON_DIR;

function send(message: ChildToHost): void {
  process.send?.(message);
}

const commands = new Map<string, AddonCommandDefinition>();
const handlers: InteractionHandler[] = [];

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

function isCommandDef(value: unknown): value is AddonCommandDefinition {
  if (typeof value !== "object" || value === null) return false;
  const def = value as Partial<AddonCommandDefinition>;
  return typeof def.name === "string" && typeof def.run === "function";
}

function isInteractionHandler(value: unknown): value is InteractionHandler {
  if (typeof value !== "object" || value === null) return false;
  const def = value as Partial<InteractionHandler>;
  return typeof def.prefix === "string" && typeof def.run === "function";
}

async function loadDefs<T>(dir: string, guard: (value: unknown) => value is T): Promise<T[]> {
  if (!(await exists(dir))) return [];

  const glob = new Bun.Glob("**/*.{ts,js,mts}");
  const defs: T[] = [];

  for await (const file of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
    if (path.basename(file).startsWith("_") || file.endsWith(".d.ts")) continue;
    const module = (await import(file)) as { default?: unknown };
    const def = module.default;
    if (guard(def)) defs.push(def);
  }
  return defs;
}

async function load(): Promise<{
  commands: AddonCommandDescriptor[];
  interactionPrefixes: string[];
}> {
  if (!(await exists(addonDir!))) throw new Error(`Addon directory ${addonDir} does not exist`);

  for (const command of await loadDefs(path.join(addonDir!, "commands"), isCommandDef)) {
    commands.set(command.name, command);
  }
  handlers.push(
    ...(await loadDefs(
      path.join(addonDir!, "interaction-handlers"),
      isInteractionHandler,
    )),
  );
  const index = path.join(addonDir!, "index.ts");
  if (await exists(index)) await import(index);

  return {
    commands: [...commands.values()].map((command) => ({
      name: command.name,
      description: command.description,
      builder: command.build?.() ?? null,
    })),
    interactionPrefixes: handlers.map((handler) => handler.prefix),
  };
}

async function run(invocation: AddonInvocation): Promise<void> {
  switch (invocation.kind) {
    case "command": {
      const command = commands.get(invocation.piece);
      if (!command) throw new Error(`No command "${invocation.piece}"`);
      const ctx = new CommandContext(invocation);
      const sub = command.handlers?.[ctx.subcommand ?? ""];
      await (sub ?? command.run)(ctx);
      return;
    }
    case "interaction": {
      const handler = handlers.find((h) => invocation.customId.startsWith(h.prefix));
      if (!handler) throw new Error(`No handler for custom id "${invocation.customId}"`);
      await handler.run(new InteractionContext(invocation));
      return;
    }
    case "task-fire": {
      const handler = getTaskHandler(invocation.task);
      if (!handler) throw new Error(`No fire handler for task "${invocation.task}"`);
      await handler(invocation.payload);
      return;
    }
    case "event": {
      const handler = getEventHandler(invocation.event);
      if (!handler) throw new Error(`No handler for event "${invocation.event}"`);
      await handler(invocation.data);
      return;
    }
  }
}

process.on("message", (message: HostToChild) => {
  switch (message.type) {
    case "rpc-response":
      settleRpc(message.response);
      return;
    case "invoke": {
      const { invocationId } = message.invocation;
      void withInvocation(invocationId, () => run(message.invocation)).then(
        () => send({ type: "invocation-done", invocationId }),
        (err: unknown) =>
          send({
            type: "invocation-done",
            invocationId,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      return;
    }
    case "shutdown":
      process.exit(0);
  }
});

if (!addonName || !addonDir) {
  send({ type: "load-failed", error: "Addon child started without LUMI_ADDON_NAME/DIR" });
  process.exit(1);
}

try {
  const loaded = await load();
  send({ type: "ready", ...loaded, tasks: registeredTasks(), events: registeredEvents() });
} catch (err: unknown) {
  send({ type: "load-failed", error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
