import type { Container } from "#src/lib/Services.js";

export interface ListenerDef<A extends unknown[] = any[]> {
  name: string;
  event: string | symbol;
  once?: boolean;

  module?: string;

  guildId?: (...args: A) => string | null;

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
