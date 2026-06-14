import { container } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";

/**
 * Self-restart support for applying downloaded-module code updates.
 *
 * Bun's ESM loader caches every module by resolved URL and offers no way to
 * purge a module *and its transitive imports* (Python's `importlib`/`sys.modules`
 * tricks that Red-DiscordBot relies on have no ESM equivalent — even Red tells
 * users to restart when a cog's shared libraries change). The only way to load a
 * changed module's full source subtree reliably is a fresh process.
 *
 * `,module update` pulls new code to disk (which the volume persists), so a clean
 * restart re-discovers and loads it. We restart by sending ourselves SIGTERM,
 * which runs each role's existing graceful drain (`runDrainSequence` →
 * `process.exit(0)`); the container's `restart: unless-stopped` policy then brings
 * the process back online with the new code. Under a non-supervised run, set
 * `MODULE_UPDATE_AUTO_RESTART=false` to keep the bot up and restart by hand.
 */

/**
 * Whether a code-changing module update should defer to a restart to apply (the
 * Bun-correct path). Default true; set `MODULE_UPDATE_AUTO_RESTART=false` to fall
 * back to the legacy best-effort in-process hot-reload instead.
 */
export function isAutoRestartEnabled(): boolean {
  return (
    (process.env.MODULE_UPDATE_AUTO_RESTART ?? "true").toLowerCase() !== "false"
  );
}

/**
 * The "Restart Now / Cancel" choice presented to the bot owner after an update
 * that needs a restart to load. `userId` scopes the buttons to the invoker.
 */
export function restartChoiceRow(
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`module:restart:${userId}`)
      .setLabel("Restart Now")
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ name: "🔄" }),
    new ButtonBuilder()
      .setCustomId(`module:restartcancel:${userId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

let restartScheduled = false;

/**
 * Schedule a graceful self-restart. Idempotent within a process. The delay lets
 * the triggering command finish replying to the user before the drain begins.
 */
export function scheduleProcessRestart(reason: string, delayMs = 2_000): void {
  if (restartScheduled) return;
  restartScheduled = true;

  container.logger.warn(
    `[Restart] Scheduling graceful restart in ${delayMs}ms — ${reason}`,
  );

  const timer = setTimeout(() => {
    container.logger.warn(
      `[Restart] Sending SIGTERM to self (pid ${process.pid})`,
    );
    // The role's SIGTERM handler drains and exits 0; the supervisor restarts us.
    process.kill(process.pid, "SIGTERM");
  }, delayMs);
  // Don't keep the event loop alive solely for this timer.
  timer.unref?.();
}
