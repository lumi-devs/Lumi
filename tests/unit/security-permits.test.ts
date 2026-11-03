import type { ModuleServices } from "@lumi/module-kit";
import type { Guild, GuildMember } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { hasPermit } from "../../modules/security/shared.ts";

function services(enforcePermits: boolean): ModuleServices {
  return {
    config: { get: vi.fn(async () => enforcePermits) },
    permits: {
      explainPermit: vi.fn(async () => ({ allowed: true, rows: [] })),
      hasWhitelistScope: vi.fn(async () => false),
    },
    helpers: { cache: {} },
  } as unknown as ModuleServices;
}

const guild = { id: "guild", ownerId: "owner" } as unknown as Guild;
const member = {
  id: "user",
  roles: { cache: new Map([["role", {}]]) },
  permissions: { has: () => false },
} as unknown as GuildMember;

describe("security hasPermit", () => {
  it("allows the manager bypass when permit enforcement is off", async () => {
    const deps = services(false);

    await expect(hasPermit(deps, guild, member, "mod.ban")).resolves.toBe(true);
    expect(deps.permits.explainPermit).toHaveBeenCalledWith(
      expect.not.objectContaining({ managerBypass: false }),
      deps.client,
    );
  });

  it("disables the manager bypass when permit enforcement is on", async () => {
    const deps = services(true);

    await expect(hasPermit(deps, guild, member, "mod.ban")).resolves.toBe(true);
    expect(deps.permits.explainPermit).toHaveBeenCalledWith(
      expect.objectContaining({ managerBypass: false }),
      deps.client,
    );
  });
});
