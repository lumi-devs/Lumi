import { describe, it, expect } from "bun:test";
import { loggingModule } from "#modules/logging/index.js";

describe("LoggingModule", () => {
  it("exposes module metadata", () => {
    expect(loggingModule).toBeDefined();
    expect(loggingModule.meta.name).toBe("logging");
    expect(loggingModule.meta.displayName).toBe("Logging");
  });

  it("handles deleteUserData without throwing", async () => {
    await expect(
      loggingModule.deleteUserData?.("user-123"),
    ).resolves.toBeUndefined();
  });
});
