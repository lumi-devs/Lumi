import { Listener, container, type StoreRegistry } from "@sapphire/framework";
import { Events } from "discord.js";

class SkipCommandRegistrationListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { event: Events.ClientReady, once: true });
  }

  public run(): void {
    container.client.id ??= container.client.user?.id ?? null;
    container.logger.info(
      "[Commands] Another replica holds the registration lock - loading pieces locally only",
    );
  }
}

/**
 * Replaces Sapphire's virtual `CoreReady` listener, the sole caller of
 * `handleRegistryAPICalls()`, so this replica never hits Discord's application
 * command routes. Command pieces still load and dispatch resolves by name.
 * Must run before the stores are loaded (i.e. before `login()`).
 */
export function suppressCommandRegistration(
  stores: StoreRegistry,
): Promise<void> {
  return stores.loadPiece({
    store: "listeners",
    name: "CoreReady",
    piece: SkipCommandRegistrationListener,
  });
}
