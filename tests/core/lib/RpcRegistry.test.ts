import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { registerRpcHandlers, verifyRpcCompleteness, getRpcHandler } from "#lib/rpc/Registry.js";
import { rpcRouter } from "#src/contracts/rpc/Index.ts";

describe("RPC Registry & Completeness Verification", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
  });

  it("registers all handlers from contract router with 100% completeness", () => {
    registerRpcHandlers();

    const completeness = verifyRpcCompleteness();
    expect(completeness.missing).toEqual([]);
    expect(completeness.extra).toEqual([]);

    const expectedActions = Object.keys(rpcRouter);
    for (const action of expectedActions) {
      const handler = getRpcHandler(action);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    }

    expect(container.logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(`[Rpc] ${expectedActions.length} actions registered`),
    );
  });
});
