import { describe, expect, test } from "bun:test";
import { modConfigSchema } from "@modules/mod/config.ts";
import { securityConfigSchema } from "@modules/security/config.ts";

describe("module config fallbacks", () => {
  test("security falls back on malformed enum and array values", () => {
    const config = securityConfigSchema.parse({
      verification_mode: "telepathy",
      verification_target: "nobody",
      verification_timeout_minutes: 0,
      panic_lock_channel_ids: "not-an-array",
      verified_role_id: 42,
    });

    expect(config.verification_mode).toBe("emoji");
    expect(config.verification_target).toBe("everyone");
    expect(config.verification_timeout_minutes).toBe(10);
    expect(config.panic_lock_channel_ids).toEqual([]);
    expect(config.verified_role_id).toBeNull();
  });

  test("mod falls back on malformed arrays and keeps defaults", () => {
    const config = modConfigSchema.parse({
      immune_role_ids: "role",
      warn_thresholds: 7,
    });

    expect(config.immune_role_ids).toEqual([]);
    expect(config.warn_thresholds).toBe("{}");
    expect(config.dm_on_punish).toBe(true);
  });
});
