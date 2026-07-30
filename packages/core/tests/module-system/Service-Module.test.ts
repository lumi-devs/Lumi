import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { Service, getService, tryGetService } from "#lib/module-system/Service.js";
import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";

class DummyService extends Service {
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
  public override reconcileScheduledJobs(): void {
    throw new Error("Reconcile error");
  }
}

describe("module-system Service and Module", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    container.db = { dummyDb: true } as any;
    container.redis = { dummyRedis: true } as any;

    const mockServicesStore = new Map();
    container.stores = {
      get: (storeName: string) => {
        if (storeName === "services") return mockServicesStore;
        return null;
      },
    } as any;
  });

  describe("Service", () => {
    it("accesses container services via getters", () => {
      const service = new DummyService({} as any, { name: "dummy" });
      const accessors = service.testAccessors();

      expect(accessors.logger).toBe(container.logger);
      expect(accessors.db).toBe(container.db);
      expect(accessors.redis).toBe(container.redis);
    });

    it("fetches service with tryGetService and throws on getService if missing", () => {
      const mockStore = container.stores.get("services") as Map<string, any>;
      const dummyServiceInstance = new DummyService({} as any, { name: "dummy" });
      mockStore.set("dummy", dummyServiceInstance);

      expect(tryGetService("dummy" as any)).toBe(dummyServiceInstance);
      expect(getService("dummy" as any)).toBe(dummyServiceInstance);

      expect(tryGetService("nonexistent" as any)).toBeUndefined();
      expect(() => getService("nonexistent" as any)).toThrow('Service "nonexistent" is not loaded');
    });
  });

  describe("Module & DefineModule", () => {
    it("decorates Module class with DefineModule and sets metadata", () => {
      expect((DummyModule as any).meta).toBeDefined();

      const mod = new DummyModule({} as any, { name: "dummy-mod" });
      expect(mod.configFields).toHaveLength(1);
      expect(mod.configFields[0].key).toBe("enabled");
      expect(mod.enabled).toBe(true);
    });

    it("executes lifecycle methods deleteUserData, reconcileScheduledJobs, onLoad, onUnload", async () => {
      const mod = new DummyModule({} as any, { name: "dummy-mod" });

      expect(mod.deleteUserData("user-1")).toBeUndefined();
      expect(mod.reconcileScheduledJobs()).toBeUndefined();

      await mod.onLoad();
      await mod.onUnload();
    });

    it("catches reconcileScheduledJobs errors in onLoad", async () => {
      const failingMod = new FailingReconcileModule({} as any, { name: "failing-mod" });

      try {
        await failingMod.onLoad();
      } catch (err: any) {
        expect(err.message).toBe("Reconcile error");
      }
    });
  });
});
