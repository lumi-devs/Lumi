import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleRpcHttpRequest } from "../src/rpc-http-server.js";
import { container, signGdprExportToken } from "@lumi/core";

const USER_ID = "111111111111111111";

describe("GET /gdpr-export", () => {
  const originalEnv = { ...process.env };
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["RPC_INTERNAL_TOKEN"] = "test-rpc-internal-token";
    dir = await mkdtemp(path.join(tmpdir(), "lumi-gdpr-download-"));
    filePath = path.join(dir, "job-1.json.gz");
    await writeFile(filePath, Buffer.from("fake gzip bytes"));

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  function get(url: string) {
    return handleRpcHttpRequest(new Request(url, { method: "GET" }), "test-rpc-internal-token");
  }

  it("returns 400 when the token query param is missing", async () => {
    const res = await get("http://127.0.0.1/gdpr-export");
    expect(res.status).toBe(400);
  });

  it("returns 401 for an invalid token", async () => {
    const res = await get("http://127.0.0.1/gdpr-export?token=not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const token = signGdprExportToken("job-1", -1_000);
    const res = await get(`http://127.0.0.1/gdpr-export?token=${token}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the job does not exist", async () => {
    (container as any).db = {
      gdprExportJobs: { findById: vi.fn().mockResolvedValue(null) },
    };
    const token = signGdprExportToken("missing-job", 60_000);
    const res = await get(`http://127.0.0.1/gdpr-export?token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 410 once the job has expired", async () => {
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue({
          id: "job-1",
          userId: USER_ID,
          status: "done",
          filePath,
          expiresAt: new Date(Date.now() - 1_000),
        }),
      },
    };
    const token = signGdprExportToken("job-1", 60_000);
    const res = await get(`http://127.0.0.1/gdpr-export?token=${token}`);
    expect(res.status).toBe(410);
  });

  it("streams the file from the job row's filePath, ignoring any path-like query input", async () => {
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue({
          id: "job-1",
          userId: USER_ID,
          status: "done",
          filePath,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const token = signGdprExportToken("job-1", 60_000);
    const res = await get(
      `http://127.0.0.1/gdpr-export?token=${token}&filePath=/etc/passwd`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(res.headers.get("content-disposition")).toContain(USER_ID);
    const body = await res.text();
    expect(body).toBe("fake gzip bytes");
  });

  it("returns 404 when the job is done but the file is missing from disk", async () => {
    (container as any).db = {
      gdprExportJobs: {
        findById: vi.fn().mockResolvedValue({
          id: "job-1",
          userId: USER_ID,
          status: "done",
          filePath: path.join(dir, "does-not-exist.json.gz"),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const token = signGdprExportToken("job-1", 60_000);
    const res = await get(`http://127.0.0.1/gdpr-export?token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 503 when no signing secret is configured", async () => {
    delete process.env["RPC_INTERNAL_TOKEN"];
    delete process.env["GDPR_EXPORT_SIGNING_SECRET"];
    const res = await get("http://127.0.0.1/gdpr-export?token=a.b.c");
    expect(res.status).toBe(503);
  });
});
