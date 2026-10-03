import { describe, it, expect } from "bun:test";
import { checkFilesystem } from "#lib/doctor/checks/filesystem.js";

describe("checkFilesystem", () => {
  it("fails when a directory does not exist", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const result = await checkFilesystem({
      dirs: { data: "/no/such/dir" },
      checkWritable: () => Promise.reject(err),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/does not exist/);
  });

  it("fails when a directory exists but is not writable", async () => {
    const err = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const result = await checkFilesystem({
      dirs: { data: "/readonly" },
      checkWritable: () => Promise.reject(err),
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/not writable/);
  });

  it("ok when every directory exists and is writable", async () => {
    const result = await checkFilesystem({
      dirs: { data: "/tmp", addons: "/tmp" },
      checkWritable: () => Promise.resolve(),
    });
    expect(result.status).toBe("ok");
  });
});
