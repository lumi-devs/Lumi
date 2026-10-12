import { describe, it, expect } from "bun:test";
import { container } from "#src/lib/Services.js";
import { loggingModule } from "#src/modules/logging/Index.js";

describe("LoggingModule", () => {
  it("exposes module metadata", () => {
    expect(loggingModule).toBeDefined();
    expect(loggingModule.meta.name).toBe("logging");
    expect(loggingModule.meta.displayName).toBe("Logging");
  });

  it("handles deleteUserData without throwing", async () => {
    await expect(
      loggingModule.deleteUserData?.(container, "user-123"),
    ).resolves.toBeUndefined();
  });
});
