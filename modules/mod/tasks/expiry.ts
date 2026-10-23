import type { LumiServices } from "@lumi/module-kit";

const SweepIntervalMs = 60_000;

/**
 * Discord expires timeouts itself; the database flag does not follow. This
 * sweep keeps `active` honest so `/cases` and future lift logic do not report
 * expired timeouts as live forever.
 */
export function startCaseExpirySweep(services: LumiServices): () => void {
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const expired = await services.db.moderation.listExpiredActive(new Date(), 100);
      for (const modCase of expired) {
        if (modCase.action === "voice_mute") {
          const guild = services.client.guilds.cache.get(modCase.guildId);
          const member = await guild?.members.fetch(modCase.userId).catch(() => null);
          // Keep the case live while the member is out of voice: the voice
          // state listener lifts it when they rejoin, and Discord may retain
          // the server mute across the disconnect.
          if (member && !member.voice.channel) continue;
          if (member?.voice.channel) {
            await member.voice
              .setMute(false, `Voice mute case #${modCase.caseNumber} expired`)
              .catch((error: unknown) => {
                services.logger.warn(
                  { error, guildId: modCase.guildId, userId: modCase.userId },
                  "failed to lift expired voice mute",
                );
              });
          }
        }
        await services.db.moderation.setCaseActive(modCase.guildId, modCase.caseNumber, false);
      }
    } catch (error) {
      services.logger.warn({ error, module: "mod" }, "case expiry sweep failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void sweep(), SweepIntervalMs);
  timer.unref();
  void sweep();

  return () => clearInterval(timer);
}
