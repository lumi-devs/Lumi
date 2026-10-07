import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import {
  defineUtility,
  getUtility,
  tryGetUtility,
} from "#lib/module-system/Utility.js";
import { defineModule } from "#lib/module-system/Module.js";
import { cfg } from "#lib/module-system/config-schema.js";

describe("module-system defineUtility and defineModule", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = { dummyDb: true } as any;
    (container as any).valkey = { dummyValkey: true } as any;
  });

  describe("defineUtility", () => {
    it("returns the def object with its methods intact", () => {
      const def = defineUtility({
        name: "dummy",
        answer: () => 42,
      });
      expect(def.name).toBe("dummy");
      expect(def.answer()).toBe(42);
    });

    it("fetches utility with tryGetUtility and throws on getUtility if missing", async () => {
      const { loadUtilities } = await import("#lib/module-system/Utility.js");
      expect(tryGetUtility("nonexistent" as any)).toBeUndefined();
      expect(() => getUtility("nonexistent" as any)).toThrow(
        'Utility "nonexistent" is not loaded',
      );
      expect(typeof loadUtilities).toBe("function");
    });
  });

  describe("defineModule", () => {
    const dummyModule = defineModule({
      name: "dummy-mod",
      displayName: "Dummy Module",
      emoji: "🎮",
      description: "A dummy module for testing",
      version: "1.0.0",
      configSchema: cfg.object({
        enabled: cfg.boolean({ label: "Enabled", description: "Enable feature" }),
      }),
    });

    it("builds metadata and derives config fields from the schema", () => {
      expect(dummyModule.meta).toBeDefined();
      expect(dummyModule.meta.name).toBe("dummy-mod");
      expect(dummyModule.configFields).toHaveLength(1);
      expect(dummyModule.configFields[0]!.key).toBe("enabled");
      expect(dummyModule.enabled).toBe(true);
    });

    it("runs lifecycle hooks with working defaults", async () => {
      expect(await dummyModule.deleteUserData?.(container, "user-1")).toBeUndefined();
      expect(await dummyModule.reconcileScheduledJobs?.(container)).toBeUndefined();

      await dummyModule.onLoad?.(container);
      await dummyModule.onUnload?.(container);
    });

    it("catches reconcileScheduledJobs errors in onLoad and logs them instead of throwing", async () => {
      const failingMod = defineModule({
        name: "failing-mod",
        description: "fails reconcile",
        reconcileScheduledJobs: () => Promise.reject(new Error("Reconcile error")),
      });

      await failingMod.onLoad?.(container);

      // reconcileScheduledJobs() failure is caught off a detached promise
      // inside onLoad(); flush microtasks so the .catch() handler runs.
      await new Promise((r) => setTimeout(r, 0));

      expect(container.logger.error).toHaveBeenCalledWith(
        "[Module:failing-mod] reconcileScheduledJobs failed:",
        expect.any(Error),
      );
      expect((container.logger.error as any).mock.calls[0][1].message).toBe(
        "Reconcile error",
      );
    });
  });
});
