import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { guildManagementGroups, guildTopLinks } from "#/lib/guild-nav";

const GUILD_ID = "101";
const GUILD_ROUTES = fileURLToPath(
  new URL("../../src/app/guild/[guildId]", import.meta.url),
);

// A `${moduleName}` left in a redirect target names the `[moduleName]` segment
// directory it lands in.
function routeDirFor(href: string): string {
  const rest = href
    .replace(`/guild/${GUILD_ID}`, "")
    .replace(/^\//, "")
    .replace(/\$\{(\w+)\}/g, "[$1]");
  return rest ? join(GUILD_ROUTES, rest) : GUILD_ROUTES;
}

const navHrefs = [
  ...guildTopLinks(GUILD_ID),
  ...guildManagementGroups(GUILD_ID).flatMap((group) => group.links),
].map((link) => link.href);

describe("guild route tree", () => {
  it("has a page for every sidebar link", () => {
    for (const href of navHrefs) {
      expect(existsSync(join(routeDirFor(href), "page.tsx")), href).toBe(true);
    }
  });
});
