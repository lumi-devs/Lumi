import type { ClientEvents } from "discord.js";
import type { LumiServices } from "./services.ts";

export interface ListenerDef<E extends keyof ClientEvents = keyof ClientEvents> {
  readonly name: string;
  readonly event: E;
  readonly module?: string;
  readonly once?: boolean;
  execute(services: LumiServices, ...args: ClientEvents[E]): Promise<void> | void;
}
