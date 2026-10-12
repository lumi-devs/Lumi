import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "#src/lib/commands/Context.js";
import { asHandler } from "#src/lib/commands/CommandDef.js";
import { tokensDef } from "#src/modules/core/commands/Tokens.js";

vi.mock("#lib/i18n/Index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/utilities/CommandResponse.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { sendInteractionReply } from "#src/lib/utilities/CommandResponse.js";

function makeServices() {
  return {
    db: {
      sharedTokens: {
        setToken: vi.fn().mockResolvedValue(undefined),
        deleteToken: vi.fn().mockResolvedValue(true),
      },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any;
}

function slashCtx(options: Record<string, unknown>, services: any) {
  const interaction = {
    user: { id: "owner-1", tag: "Owner#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: vi.fn().mockImplementation((name: string) => options[name] ?? null),
    },
  } as any;
  return CommandContext.fromInteraction(interaction, services);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("tokensDef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is an owner-only command", () => {
    expect(tokensDef.botOwner).toBe(true);
  });

  it("set stores the token without echoing it", async () => {
    const services = makeServices();
    const ctx = slashCtx({ service: "weather", token: "s3cr3t" }, services);
    await asHandler(tokensDef.handlers!["set"]!).run(ctx);
    expect(services.db.sharedTokens.setToken).toHaveBeenCalledWith(
      "weather",
      "s3cr3t",
    );
    const card = lastCardJson();
    expect(card).toContain("weather");
    expect(card).not.toContain("s3cr3t");
  });

  it("set rejects blank service names", async () => {
    const services = makeServices();
    const ctx = slashCtx({ service: "  ", token: "s3cr3t" }, services);
    await asHandler(tokensDef.handlers!["set"]!).run(ctx);
    expect(services.db.sharedTokens.setToken).not.toHaveBeenCalled();
    expect(lastCardJson()).toContain("Invalid Service");
  });

  it("remove deletes and confirms", async () => {
    const services = makeServices();
    const ctx = slashCtx({ service: "weather" }, services);
    await asHandler(tokensDef.handlers!["remove"]!).run(ctx);
    expect(services.db.sharedTokens.deleteToken).toHaveBeenCalledWith(
      "weather",
    );
    expect(lastCardJson()).toContain("weather");
  });

  it("remove reports unknown services", async () => {
    const services = makeServices();
    services.db.sharedTokens.deleteToken.mockResolvedValue(false);
    const ctx = slashCtx({ service: "missing" }, services);
    await asHandler(tokensDef.handlers!["remove"]!).run(ctx);
    expect(lastCardJson()).toContain("Not Found");
  });
});
