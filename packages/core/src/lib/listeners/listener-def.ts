import type { Container } from "@lumi/lib/services.js";

export interface ListenerDef<A extends unknown[] = any[]> {
  name: string;
  event: string | symbol;
  once?: boolean;
  /** Module whose enabled state gates this listener (checked per event). */
  module?: string;
  /** Guild resolution override (default: args[0].guildId ?? args[0].guild.id). */
  guildId?: (...args: A) => string | null;
  /** Cleanup on detach (timers, external subscriptions). */
  onDetach?: () => unknown;
  execute: (services: Container, ...args: A) => unknown;
}

export function defineListener<A extends unknown[]>(
  def: ListenerDef<A>,
): ListenerDef<A> {
  return def;
}

const registry: ListenerDef<any>[] = [];

export function addListenerDef(def: ListenerDef<any>): void {
  if (!registry.includes(def)) registry.push(def);
}
