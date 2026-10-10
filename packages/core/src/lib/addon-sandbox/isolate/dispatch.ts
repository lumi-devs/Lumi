import { CommandContext, type AddonCommandDefinition } from "../sdk/commands.js";
import { InteractionContext, type InteractionHandler } from "../sdk/interactions.js";
import { getEventHandler, registeredEvents } from "../sdk/events.js";
import { getTaskHandler, registeredTasks } from "../sdk/scheduling.js";
import { setRpcTransport, withInvocation, type RpcEnvelope } from "../sdk/rpc.js";
import type { AddonInvocation, AddonReady, ConfigField } from "@lumi/contracts";

const commands = new Map<string, AddonCommandDefinition>();
const handlers: InteractionHandler[] = [];
let configFields: ConfigField[] = [];

export function addCommand(def: unknown): void {
  if (typeof def !== "object" || def === null) return;
  const d = def as Partial<AddonCommandDefinition>;
  if (typeof d.name === "string" && typeof d.run === "function")
    commands.set(d.name, d as AddonCommandDefinition);
}

export function addInteractionHandler(def: unknown): void {
  if (typeof def !== "object" || def === null) return;
  const d = def as Partial<InteractionHandler>;
  if (typeof d.prefix === "string" && typeof d.run === "function")
    handlers.push(d as InteractionHandler);
}

export function setConfigFields(fields: ConfigField[]): void {
  configFields = fields;
}

export function initIsolateTransport(
  send: (envelope: RpcEnvelope) => Promise<unknown>,
): void {
  let currentId: string | undefined;
  setRpcTransport({
    currentInvocation: () => currentId,
    runWithInvocation: (id, fn) => {
      const prev = currentId;
      currentId = id;
      return fn().finally(() => {
        currentId = prev;
      });
    },
    send,
  });
}

export function describeAddon(): Omit<AddonReady, "type"> {
  return {
    commands: [...commands.values()].map((command) => ({
      name: command.name,
      description: command.description,
      builder: command.build?.() ?? null,
    })),
    interactionPrefixes: handlers.map((handler) => handler.prefix),
    configFields,
    tasks: registeredTasks(),
    events: registeredEvents(),
  };
}

export function invokeAddon(invocation: AddonInvocation): Promise<void> {
  return withInvocation(invocation.invocationId, async () => {
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
  });
}
