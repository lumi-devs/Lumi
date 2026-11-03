import type { AddonNotifier } from "@lumi/downloader";
import type { Client } from "discord.js";
import { ownerIds } from "./owner.js";

export function createAddonNotifier(client: Client): AddonNotifier {
  return async (report) => {
    const owners = ownerIds();
    if (owners.length === 0) return;

    const lines = [
      "**Add-on auto-update**",
      ...report.updated.map((name) => `✅ Updated ${name}`),
      ...report.failures.map(
        (failure) => `❌ ${failure.module}: ${failure.error}`,
      ),
    ];
    for (const ownerId of owners) {
      const user = await client.users.fetch(ownerId).catch(() => null);
      await user?.send(lines.join("\n")).catch(() => undefined);
    }
  };
}
