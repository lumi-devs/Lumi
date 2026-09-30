import { describe, it, expect } from "bun:test";
import { checkAddonCompat } from "#lib/doctor/checks/addon-compat.js";

describe("checkAddonCompat", () => {
  it("ok when no addons are installed", async () => {
    const result = await checkAddonCompat({
      currentVersion: "0.5.0",
      listInstalledAddons: () => Promise.resolve([]),
    });
    expect(result.status).toBe("ok");
  });

  it("fails when an addon requires a newer bot version", async () => {
    const result = await checkAddonCompat({
      currentVersion: "0.4.0",
      listInstalledAddons: () =>
        Promise.resolve([{ name: "some-addon", info: { min_bot_version: "0.5.0" } }]),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/some-addon/);
  });

  it("fails when an addon caps below the current bot version", async () => {
    const result = await checkAddonCompat({
      currentVersion: "0.6.0",
      listInstalledAddons: () =>
        Promise.resolve([{ name: "old-addon", info: { max_bot_version: "0.5.0" } }]),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/old-addon/);
  });

  it("ok when installed addons are within range", async () => {
    const result = await checkAddonCompat({
      currentVersion: "0.5.0",
      listInstalledAddons: () =>
        Promise.resolve([
          { name: "fine-addon", info: { min_bot_version: "0.4.0", max_bot_version: "0.6.0" } },
        ]),
    });
    expect(result.status).toBe("ok");
  });

  it("ignores an addon whose info.json could not be read", async () => {
    const result = await checkAddonCompat({
      currentVersion: "0.5.0",
      listInstalledAddons: () => Promise.resolve([{ name: "broken-addon", info: null }]),
    });
    expect(result.status).toBe("ok");
  });
});
