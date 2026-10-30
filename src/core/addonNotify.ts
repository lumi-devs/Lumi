import type { AddonNotifier } from "@lumi/downloader";
import type { Client } from "discord.js";






export function createAddonNotifier(client: Client): AddonNotifier {
  return async (report) => {
    const ownerIds = (process.env.OWNER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ownerIds.length === 0) return;

    const lines = [
      "**Add-on auto-update**",
      ...report.updated.map((name) => `✅ Updated ${name}`),
      ...report.failures.map((failure) => `❌ ${failure.module}: ${failure.error}`),
    ];
    for (const ownerId of ownerIds) {
      const user = await client.users.fetch(ownerId).catch(() => null);
      await user?.send(lines.join("\n")).catch(() => undefined);
    }
  };
}
