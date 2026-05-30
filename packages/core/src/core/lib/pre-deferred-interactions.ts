// When the gateway service pre-acks INTERACTION_CREATE via REST (path (a) under
// INTERACTION_DEFER_AT_GATEWAY=true), the worker reconstructs the Interaction
// from the raw packet and has no idea Discord already saw a callback. Calling
// `interaction.deferReply()` / `deferUpdate()` would then 40060 ("interaction
// already acknowledged"), and `interaction.reply()` would fail similarly.
//
// We patch the discord.js Interaction prototypes once, on the worker, so those
// methods become no-ops that flip the local `deferred`/`replied` flags without
// touching REST. Subsequent `editReply`/`followUp` calls keep working because
// they already use the followup endpoints (which Discord accepts post-defer).
//
// This patch is global to the process — call it exactly once during worker
// startup, gated on the env flag. The gateway never imports this file.

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

  // Non-`async`: these replace Promise-returning prototype methods but do no
  // IO, so they return a resolved promise directly rather than `await` nothing.
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

  (
    ChatInputCommandInteraction.prototype as unknown as { deferReply: unknown }
  ).deferReply = skipDeferReply;
  (
    ContextMenuCommandInteraction.prototype as unknown as {
      deferReply: unknown;
    }
  ).deferReply = skipDeferReply;
  (
    ModalSubmitInteraction.prototype as unknown as { deferReply: unknown }
  ).deferReply = skipDeferReply;
  (
    MessageComponentInteraction.prototype as unknown as {
      deferReply: unknown;
    }
  ).deferReply = skipDeferReply;
  (
    MessageComponentInteraction.prototype as unknown as {
      deferUpdate: unknown;
    }
  ).deferUpdate = skipDeferUpdate;
  // Autocomplete cannot be pre-acked (gateway must not defer type-4 interactions).
  void AutocompleteInteraction;

  log("[Worker] Installed pre-deferred Interaction patches (path a)");
}
