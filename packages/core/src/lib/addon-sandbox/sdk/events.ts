import type { AddonEventName } from "@lumi/contracts";

export type AddonEventHandler = (data: Record<string, unknown>) => unknown | Promise<unknown>;

const handlers = new Map<AddonEventName, AddonEventHandler>();

export function onEvent(event: AddonEventName, handler: AddonEventHandler): void {
  handlers.set(event, handler);
}

export function registeredEvents(): AddonEventName[] {
  return [...handlers.keys()];
}

export function getEventHandler(event: AddonEventName): AddonEventHandler | undefined {
  return handlers.get(event);
}
