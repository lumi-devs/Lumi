import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { getRpcHandler, registerRpcHandlers } from "#lib/rpc/registry.js";

const BOT_OWNER_ID = "111111111111111111";
const INTRUDER_ID = "333333333333333333";

describe("system.status.get RPC handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    container.client = {
      application: { owner: { id: BOT_OWNER_ID } },
      guilds: { cache: new Map() },
    } as any;

    registerRpcHandlers();
  });

  // Deliberately does not exercise a successful call: the real handler reads
  // the shared scheduled-tasks BullMQ queue through its own connection (see
  // `system-rpc.ts`'s `getScheduledTasksQueue()`), which isn't something this
  // offline suite can fake without a live Valkey - `getSystemStatus` itself
  // (the aggregation this handler delegates to) is covered directly with
  // fakes in `system-status.test.ts`. This only proves the action is wired
  // into the registry with the right auth gate.
  it("is registered", () => {
    expect(getRpcHandler("system.status.get")).toBeDefined();
  });

  it("rejects anyone who is not a bot owner before touching any dependency", async () => {
    const handler = getRpcHandler("system.status.get")!;

    await expect(
      handler({ id: "req", action: "system.status.get", actorId: INTRUDER_ID }),
    ).rejects.toThrow(/Bot Owner/);
    await expect(
      handler({ id: "req", action: "system.status.get", actorId: undefined }),
    ).rejects.toThrow(/Bot Owner/);
  });
});
