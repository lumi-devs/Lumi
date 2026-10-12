import type { CommandContext } from "#src/lib/commands/Context.js";

export interface BeforeInvokeDenial {
  reason: string;
}

export type BeforeInvokeHook = (
  ctx: CommandContext,
) => BeforeInvokeDenial | null | Promise<BeforeInvokeDenial | null>;

const beforeInvokeHooks = new Map<string, BeforeInvokeHook>();

export function addBeforeInvokeHook(name: string, fn: BeforeInvokeHook): void {
  beforeInvokeHooks.set(name, fn);
}

export function removeBeforeInvokeHook(name: string): boolean {
  return beforeInvokeHooks.delete(name);
}

export async function runBeforeInvokeHooks(
  ctx: CommandContext,
): Promise<BeforeInvokeDenial | null> {
  for (const fn of beforeInvokeHooks.values()) {
    const denial = await fn(ctx);
    if (denial) return denial;
  }
  return null;
}
