import { describe, it, expect } from "vitest";
import { humanizeKey } from "#/lib/log-format";

describe("humanizeKey", () => {
  it("title-cases a snake_case key", () => {
    expect(humanizeKey("case_id")).toBe("Case Id");
    expect(humanizeKey("mod_log_channel_id")).toBe("Mod Log Channel Id");
  });

  it("title-cases a camelCase key", () => {
    expect(humanizeKey("caseId")).toBe("Case Id");
    expect(humanizeKey("modLogChannelId")).toBe("Mod Log Channel Id");
  });

  it("handles a single lowercase word", () => {
    expect(humanizeKey("duration")).toBe("Duration");
  });
});
