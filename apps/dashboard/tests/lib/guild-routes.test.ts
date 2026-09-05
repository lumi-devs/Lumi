import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function isDynamic(href: string): boolean {
  return href.includes("${");
}

const navHrefs = [
  ...guildTopLinks(GUILD_ID),
  ...guildManagementGroups(GUILD_ID).flatMap((group) => group.links),
].map((link) => link.href);

// Every route directory whose page body is nothing but a `legacyRedirect` call.
function legacyRedirects(dir: string, prefix = ""): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const here = `${prefix}/${entry.name}`;
    const page = join(dir, entry.name, "page.tsx");
    if (existsSync(page)) {
      const source = readFileSync(page, "utf8");
      const target = /legacyRedirect\(\s*`([^`]+)`/.exec(source)?.[1];
      if (target) found.push([here, target.replace("${guildId}", GUILD_ID)]);
    }
    found.push(...legacyRedirects(join(dir, entry.name), here));
  }
  return found;
}

describe("guild route tree", () => {
  it("has a page for every sidebar link", () => {
    for (const href of navHrefs) {
      expect(existsSync(join(routeDirFor(href), "page.tsx")), href).toBe(true);
    }
  });

  it("keeps every pre-reorganisation path alive as a redirect to a live page", () => {
    const redirects = legacyRedirects(GUILD_ROUTES);
    expect(redirects.length).toBeGreaterThan(0);

    for (const [from, to] of redirects) {
      expect(existsSync(join(routeDirFor(to), "page.tsx")), `${from} -> ${to}`).toBe(
        true,
      );
      if (!isDynamic(to)) {
        expect(navHrefs, `${from} -> ${to}`).toContain(to);
      }
    }
  });
});
