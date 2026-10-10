import { describe, it, expect } from "bun:test";
import { checkDashboardOAuth } from "@lumi/lib/doctor/checks/dashboard-oauth.js";

describe("checkDashboardOAuth", () => {
  it("skips when none of the dashboard OAuth env vars are set", async () => {
    const result = await checkDashboardOAuth({ isDefined: () => false });
    expect(result.status).toBe("skip");
  });

  it("warns when only some of the dashboard OAuth env vars are set", async () => {
    const result = await checkDashboardOAuth({
      isDefined: (key) => key === "DISCORD_OAUTH2_CLIENT_ID",
    });
    expect(result.status).toBe("warn");
    expect(result.detail).toMatch(/DISCORD_OAUTH2_CLIENT_SECRET/);
  });

  it("ok when every dashboard OAuth env var is set", async () => {
    const result = await checkDashboardOAuth({ isDefined: () => true });
    expect(result.status).toBe("ok");
  });
});
