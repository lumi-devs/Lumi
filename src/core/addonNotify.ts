import type { AddonNotifier } from "@lumi/downloader";
import { makeInfoCard, makeWarningCard } from "@lumi/ui";
import type { Client } from "discord.js";
import { ownerIds } from "./owner.js";

export function createAddonNotifier(client: Client): AddonNotifier {
  return async (report) => {
    const owners = ownerIds();
    if (owners.length === 0) return;

    const lines = [
      ...report.updated.map((name) => `✅ Updated ${name}`),
      ...report.failures.map(
        (failure) => `❌ ${failure.module}: ${failure.error}`,
      ),
    ];
    const card =
      report.failures.length > 0
        ? makeWarningCard("Add-on auto-update", lines)
        : makeInfoCard("Add-on auto-update", lines);
    for (const ownerId of owners) {
      const user = await client.users.fetch(ownerId).catch(() => null);
      await user?.send(card).catch(() => undefined);
    }
  };
}
