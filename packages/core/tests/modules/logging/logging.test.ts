import { describe, it, expect } from "vitest";
import { LoggingModule } from "#modules/logging/index.js";

describe("LoggingModule", () => {
  it("instantiates correctly and exposes module metadata", () => {
    const mod = new LoggingModule(
      { name: "logging", store: { name: "modules" } } as any,
      {},
    );
    expect(mod).toBeDefined();
    expect((LoggingModule as any).meta.name).toBe("logging");
    expect((LoggingModule as any).meta.displayName).toBe("Logging");
  });

  it("handles deleteUserData without throwing", async () => {
    const mod = new LoggingModule(
      { name: "logging", store: { name: "modules" } } as any,
      {},
    );
    await expect(mod.deleteUserData("user-123")).resolves.toBeUndefined();
  });
});
