import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";
import {
  dispatchChatInput,
  dispatchMessage,
  onCommandError,
} from "#src/lib/commands/CommandDispatch.js";
import { resolveErrorCard, respond, respondMessage } from "#src/lib/utilities/CommandResponse.js";

vi.mock("#src/lib/utilities/CommandResponse.js", () => ({
  handleDenied: vi.fn().mockResolvedValue(undefined),
  resolveErrorCard: vi.fn().mockReturnValue({ card: { mocked: true }, expected: false }),
  respond: vi.fn().mockResolvedValue(undefined),
  respondMessage: vi.fn().mockResolvedValue(undefined),
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#src/lib/Telemetry.js", () => ({
  instrumentedRun: vi.fn((_name: string, _kind: string, _target: unknown, fn: () => unknown) => fn()),
}));

function slashInteraction() {
  return {
    commandName: "boomtest",
    user: { id: "user-1" },
    guildId: "guild-1",
    guild: { id: "guild-1", ownerId: "owner-1" },
    member: { roles: { cache: new Map() } },
    channelId: "channel-1",
  } as any;
}

function prefixMessage(content: string) {
  return {
    partial: false,
    author: { bot: false, id: "user-1" },
    guild: { id: "guild-1" },
    guildId: "guild-1",
    member: { roles: { cache: new Map() } },
    channelId: "channel-1",
    content,
  } as any;
}

describe("command local error handlers", () => {
  let offs: (() => void)[];
  let savedDb: unknown;
  let savedModules: unknown;
  let savedPermits: unknown;
  let savedLogger: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    offs = [];
    savedDb = (container as any).db;
    savedModules = (container as any).moduleStore;
    savedPermits = (container as any).permitResolver;
    savedLogger = (container as any).logger;
    (container as any).db = {
      access: { allowedByLists: vi.fn().mockResolvedValue(true) },
      global: { getGlobalConfig: vi.fn().mockResolvedValue({ maintenanceMode: false }) },
      modules: { isModuleEnabled: vi.fn().mockResolvedValue(true) },
      config: { getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!" }) },
    };
    (container as any).moduleStore = {
      isModuleDisableable: vi.fn().mockReturnValue(false),
      moduleNameForLocation: vi.fn().mockReturnValue(null),
    };
    (container as any).permitResolver = { hasPermit: vi.fn().mockResolvedValue(true) };
    (container as any).logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };
    commandRegistry.set("boomtest", {
      name: "boomtest",
      module: "core",
      run: () => {
        throw new Error("boom");
      },
    });
  });

  afterEach(() => {
    for (const off of offs) off();
    commandRegistry.delete("boomtest");
    commandRegistry.delete("kick");
    (container as any).db = savedDb;
    (container as any).moduleStore = savedModules;
    (container as any).permitResolver = savedPermits;
    (container as any).logger = savedLogger;
  });

  it("falls through to the global handler when none is registered", async () => {
    await dispatchChatInput(container, slashInteraction());
    expect(resolveErrorCard).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it("skips the global handler when the local handler reports handled", async () => {
    const seen: unknown[] = [];
    offs.push(
      onCommandError("boomtest", async (error) => {
        seen.push(error);
        return true;
      }),
    );
    await dispatchChatInput(container, slashInteraction());
    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toBe("boom");
    expect(resolveErrorCard).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it("falls through to the global handler with the rethrown error", async () => {
    offs.push(
      onCommandError("boomtest", async () => {
        throw new Error("rethrown");
      }),
    );
    await dispatchChatInput(container, slashInteraction());
    expect(resolveErrorCard).toHaveBeenCalledTimes(1);
    expect((resolveErrorCard as any).mock.calls[0][1].message).toBe("rethrown");
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it("falls through when the local handler abstains", async () => {
    offs.push(onCommandError("boomtest", () => undefined));
    await dispatchChatInput(container, slashInteraction());
    expect(resolveErrorCard).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it("stops consulting after unsubscribe", async () => {
    const off = onCommandError("boomtest", async () => true);
    off();
    await dispatchChatInput(container, slashInteraction());
    expect(resolveErrorCard).toHaveBeenCalledTimes(1);
  });

  it("suggests a close match for an unknown prefix command", async () => {
    commandRegistry.set("kick", { name: "kick", module: "mod" });
    const client = { user: { id: "bot-1" } } as any;
    await dispatchMessage(container, client, prefixMessage("!kik"));
    expect(respondMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((respondMessage as any).mock.calls[0][1])).toContain("kick");
  });

  it("stays silent for an unknown prefix command with no close match", async () => {
    commandRegistry.set("kick", { name: "kick", module: "mod" });
    const client = { user: { id: "bot-1" } } as any;
    await dispatchMessage(container, client, prefixMessage("!zzzzzz"));
    expect(respondMessage).not.toHaveBeenCalled();
  });
});
