import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { getRpcHandler, registerRpcHandlers } from "#src/lib/rpc/Registry.js";

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
