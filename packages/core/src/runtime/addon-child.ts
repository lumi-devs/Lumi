import path from "node:path";
import { stat } from "node:fs/promises";
import type {
  AddonCommandDescriptor,
  AddonInvocation,
  ChildToHost,
  HostToChild,
} from "@lumi/contracts";
import { CommandContext, type BaseCommand } from "#lib/addon-sandbox/sdk/commands.js";
import {
  InteractionContext,
  type BaseInteractionHandler,
} from "#lib/addon-sandbox/sdk/interactions.js";
import { getTaskHandler, registeredTasks } from "#lib/addon-sandbox/sdk/scheduling.js";
import { settleRpc, withInvocation } from "#lib/addon-sandbox/sdk/rpc.js";
import { captureBuilder } from "#lib/addon-sandbox/sdk/builder.js";

const addonName = process.env.LUMI_ADDON_NAME;
const addonDir = process.env.LUMI_ADDON_DIR;

function send(message: ChildToHost): void {
  process.send?.(message);
}

const commands = new Map<string, BaseCommand>();
const handlers: BaseInteractionHandler[] = [];

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

async function loadPieces<T>(dir: string): Promise<T[]> {
  if (!(await exists(dir))) return [];

  const glob = new Bun.Glob("**/*.{ts,js,mts}");
  const pieces: T[] = [];

  for await (const file of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
    if (path.basename(file).startsWith("_") || file.endsWith(".d.ts")) continue;
    const module = (await import(file)) as { default?: new () => T };
    if (typeof module.default === "function") pieces.push(new module.default());
  }
  return pieces;
}

async function load(): Promise<{
  commands: AddonCommandDescriptor[];
  interactionPrefixes: string[];
}> {
  if (!(await exists(addonDir!))) throw new Error(`Addon directory ${addonDir} does not exist`);

  for (const command of await loadPieces<BaseCommand>(path.join(addonDir!, "commands"))) {
    commands.set(command.name, command);
  }
  handlers.push(
    ...(await loadPieces<BaseInteractionHandler>(
      path.join(addonDir!, "interaction-handlers"),
    )),
  );
  // Importing the index registers the addon's task fire handlers as a side effect.
  const index = path.join(addonDir!, "index.ts");
  if (await exists(index)) await import(index);

  return {
    commands: [...commands.values()].map((command) => ({
      name: command.name,
      description: command.description,
      builder: captureBuilder(command),
    })),
    interactionPrefixes: handlers.map((handler) => handler.prefix),
  };
}

async function run(invocation: AddonInvocation): Promise<void> {
  switch (invocation.kind) {
    case "command": {
      const command = commands.get(invocation.piece);
      if (!command) throw new Error(`No command "${invocation.piece}"`);
      await command.run(new CommandContext(invocation));
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
  send({ type: "ready", ...loaded, tasks: registeredTasks() });
} catch (err: unknown) {
  send({ type: "load-failed", error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
