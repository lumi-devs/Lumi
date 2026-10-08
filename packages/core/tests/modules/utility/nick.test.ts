import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "#lib/commands/context.js";
import { nickDef } from "#modules/utility/commands/nick.js";

vi.mock("#lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { sendInteractionReply } from "#lib/utilities/command-response.js";

function makeServices() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

function role(position: number) {
  return { position };
}

function member(id: string, opts: { highest?: number; displayName?: string; failSet?: boolean } = {}) {
  const highest = role(opts.highest ?? 1);
  return {
    id,
    displayName: opts.displayName ?? "OldNick",
    roles: { highest },
    setNickname: opts.failSet
      ? vi.fn().mockRejectedValue(new Error("Missing Permissions"))
      : vi.fn().mockResolvedValue(undefined),
  } as any;
}

function slashCtx(services: any, target: any, invokerId = "mod-1") {
  const interaction = {
    user: { id: invokerId, tag: "Mod#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: vi.fn().mockReturnValue("NewNick"),
      getMember: vi.fn().mockReturnValue(target),
    },
  } as any;
  const ctx = CommandContext.fromInteraction(interaction, services);
  return { ctx, interaction };
}

function modCtx(services: any, target: any, moderatorHighest: number, ownerId = "owner-9") {
  const { ctx, interaction } = slashCtx(services, target);
  Object.defineProperty(ctx, "member", {
    get: () => ({ id: "mod-1", roles: { highest: role(moderatorHighest) } }),
  });
  Object.defineProperty(ctx, "guild", {
    get: () => ({ id: "g-1", ownerId, members: { me: null } }),
  });
  return { ctx, interaction };
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("nickDef", () => {
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
  });

  it("shows usage when no member resolves", async () => {
    const { ctx, interaction } = slashCtx(services, null);
    interaction.options.getMember.mockReturnValue(null);

    await nickDef.run!(ctx);

    expect(lastCardJson()).toContain("commands:nickUsageTitle");
  });

  it("warns when targeting yourself", async () => {
    const target = member("mod-1");
    const { ctx } = modCtx(services, target, 5);

    await nickDef.run!(ctx);

    expect(lastCardJson()).toContain("commands:nickInvalidTargetTitle");
    expect(target.setNickname).not.toHaveBeenCalled();
  });

  it("refuses targets at or above the moderator's top role", async () => {
    const target = member("user-2", { highest: 5 });
    const { ctx } = modCtx(services, target, 5);

    await nickDef.run!(ctx);

    expect(lastCardJson()).toContain("commands:nickPermissionDeniedTitle");
    expect(target.setNickname).not.toHaveBeenCalled();
  });

  it("renames a lower-ranked member and confirms", async () => {
    const target = member("user-2", { highest: 1 });
    const { ctx } = modCtx(services, target, 5);

    await nickDef.run!(ctx);

    expect(target.setNickname).toHaveBeenCalledWith("NewNick");
    expect(lastCardJson()).toContain("commands:nickSuccessTitle");
  });

  it("reports a Discord failure instead of claiming success", async () => {
    const target = member("user-2", { highest: 1, failSet: true });
    const { ctx } = modCtx(services, target, 5);

    await nickDef.run!(ctx);

    expect(lastCardJson()).toContain("commands:nickFailed");
  });
});
