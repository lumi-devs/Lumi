import {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  ContextMenuCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";

interface MutableInteraction {
  deferred: boolean;
  replied: boolean;
  ephemeral: boolean | null;
}

interface DeferOpts {
  flags?: number;
  withResponse?: boolean;
}

let installed = false;

export function installPreDeferredInteractions(
  log: (msg: string) => void = () => undefined,
): void {
  if (installed) return;
  installed = true;

  const skipDeferReply = function (this: MutableInteraction, opts?: DeferOpts) {
    if (this.deferred || this.replied)
      return Promise.resolve(undefined as never);
    this.deferred = true;
    this.ephemeral = (opts?.flags ?? 0) & MessageFlags.Ephemeral ? true : false;
    return Promise.resolve(undefined as never);
  };

  const skipDeferUpdate = function (this: MutableInteraction) {
    if (this.deferred || this.replied)
      return Promise.resolve(undefined as never);
    this.deferred = true;
    return Promise.resolve(undefined as never);
  };

  const patch = (proto: object, method: string, fn: unknown): void => {
    (proto as Record<string, unknown>)[method] = fn;
  };

  patch(ChatInputCommandInteraction.prototype, "deferReply", skipDeferReply);
  patch(ContextMenuCommandInteraction.prototype, "deferReply", skipDeferReply);
  patch(ModalSubmitInteraction.prototype, "deferReply", skipDeferReply);
  patch(MessageComponentInteraction.prototype, "deferReply", skipDeferReply);
  patch(MessageComponentInteraction.prototype, "deferUpdate", skipDeferUpdate);
  void AutocompleteInteraction;

  log("[Worker] Installed pre-deferred Interaction patches (path a)");
}
