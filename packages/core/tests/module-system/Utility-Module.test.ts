import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { Utility, getUtility, tryGetUtility } from "#lib/module-system/Utility.js";
import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";

class DummyUtility extends Utility {
  public testAccessors() {
    return {
      logger: this.logger,
      db: this.db,
      redis: this.redis,
    };
  }
}

class BaseDummyModule extends Module {
  public override reconcileScheduledJobs(): void {
    // Custom reconcile
  }
}

const DummyModule = DefineModule({
  name: "dummy-mod",
  displayName: "Dummy Module",
  emoji: "🎮",
  description: "A dummy module for testing",
  version: "1.0.0",
  configSchema: cfg.object({
    enabled: cfg.boolean({ label: "Enabled", description: "Enable feature" }),
  }),
})(BaseDummyModule);

class FailingReconcileModule extends Module {
  public override reconcileScheduledJobs(): Promise<void> {
    return Promise.reject(new Error("Reconcile error"));
  }
}

describe("module-system Utility and Module", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = { dummyDb: true } as any;
    (container as any).redis = { dummyRedis: true } as any;

    const mockUtilitiesStore = new Map();
    container.stores = {
      get: (storeName: string) => {
        if (storeName === "utilities") return mockUtilitiesStore;
        return null;
      },
    } as any;
  });

  describe("Utility", () => {
    it("accesses container utilities via getters", () => {
      const utility = new DummyUtility({} as any, { name: "dummy" });
      const accessors = utility.testAccessors();

      expect(accessors.logger).toBe(container.logger);
      expect(accessors.db).toBe(container.db);
      expect(accessors.redis).toBe(container.redis);
    });

    it("fetches utility with tryGetUtility and throws on getUtility if missing", () => {
      const mockStore = container.stores.get("utilities") as unknown as Map<string, any>;
      const dummyUtilityInstance = new DummyUtility({} as any, { name: "dummy" });
      mockStore.set("dummy", dummyUtilityInstance);

      expect(tryGetUtility("dummy" as any)).toBe(dummyUtilityInstance);
      expect(getUtility("dummy" as any)).toBe(dummyUtilityInstance);

      expect(tryGetUtility("nonexistent" as any)).toBeUndefined();
      expect(() => getUtility("nonexistent" as any)).toThrow('Utility "nonexistent" is not loaded');
    });
  });

  describe("Module & DefineModule", () => {
    it("decorates Module class with DefineModule and sets metadata", () => {
      expect((DummyModule as any).meta).toBeDefined();

      const mod = new DummyModule({} as any, { name: "dummy-mod" });
      expect(mod.configFields).toHaveLength(1);
      expect(mod.configFields[0]!.key).toBe("enabled");
      expect(mod.enabled).toBe(true);
    });

    it("executes lifecycle methods deleteUserData, reconcileScheduledJobs, onLoad, onUnload", async () => {
      const mod = new DummyModule({} as any, { name: "dummy-mod" });

      expect(mod.deleteUserData("user-1")).toBeUndefined();
      expect(mod.reconcileScheduledJobs()).toBeUndefined();

      await mod.onLoad();
      await mod.onUnload();
    });

    it("catches reconcileScheduledJobs errors in onLoad and logs them instead of throwing", async () => {
      const failingMod = new FailingReconcileModule({} as any, { name: "failing-mod" });

      await failingMod.onLoad();

      // reconcileScheduledJobs() failure is caught off a detached promise
      // inside onLoad(); flush microtasks so the .catch() handler runs.
      await new Promise((r) => setTimeout(r, 0));

      expect(container.logger.error).toHaveBeenCalledWith(
        "[Module:failing-mod] reconcileScheduledJobs failed:",
        expect.any(Error),
      );
      expect((container.logger.error as any).mock.calls[0][1].message).toBe("Reconcile error");
    });
  });
});
