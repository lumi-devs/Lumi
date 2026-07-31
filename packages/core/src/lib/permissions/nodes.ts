import { container } from "@sapphire/framework";
import type { BaseCommand } from "#lib/commands.js";

/** Every distinct permit node required by a loaded command, sorted alphabetically. */
export function collectKnownPermitNodes(): string[] {
  const nodes = new Set<string>();
  for (const command of container.stores.get("commands").values()) {
    const node = (command as unknown as BaseCommand).requiredPermit;
    if (node) nodes.add(node);
  }
  return [...nodes].sort();
}
