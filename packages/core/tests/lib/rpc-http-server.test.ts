import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  startRpcHttpServer,
  handleRpcHttpRequest,
  tokenMatches,
  presentedToken,
  readInternalToken,
} from "../../src/lib/rpc/http-server.js";
import { registerRpcHandler, rpcHandlers } from "../../src/lib/rpc/dispatch.js";

describe("RPC HTTP Server & Auth Verification", () => {
  const originalEnv = { ...process.env };
  const mockLogger = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    rpcHandlers.clear();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = {
      config: {
        isDashboardEnabled: vi.fn().mockResolvedValue(true),
      },
    } as any;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("tokenMatches (constant-time verification)", () => {
    it("returns true when tokens match", () => {
      expect(tokenMatches("secret-token-123", "secret-token-123")).toBe(true);
    });

    it("returns false when tokens differ", () => {
      expect(tokenMatches("secret-token-123", "wrong-token-456")).toBe(false);
    });

    it("returns false when presented token is null or empty", () => {
      expect(tokenMatches("secret-token-123", null)).toBe(false);
      expect(tokenMatches("secret-token-123", "")).toBe(false);
    });

    it("handles tokens of different lengths without throwing", () => {
      expect(tokenMatches("short", "much-longer-token-value")).toBe(false);
      expect(tokenMatches("much-longer-token-value", "short")).toBe(false);
    });
  });

  describe("presentedToken (header extraction)", () => {
    it("extracts token from valid Bearer authorization header", () => {
      const req = new Request("http://127.0.0.1/rpc", {
        headers: { authorization: "Bearer my-secret-token" },
      });
      expect(presentedToken(req)).toBe("my-secret-token");
    });

    it("trims whitespace from bearer token", () => {
      const req = new Request("http://127.0.0.1/rpc", {
        headers: { authorization: "Bearer    my-secret-token   " },
      });
      expect(presentedToken(req)).toBe("my-secret-token");
    });

    it("returns null when authorization header is missing", () => {
      const req = new Request("http://127.0.0.1/rpc");
      expect(presentedToken(req)).toBeNull();
    });

    it("returns null when authorization header does not use Bearer scheme", () => {
      const req = new Request("http://127.0.0.1/rpc", {
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      expect(presentedToken(req)).toBeNull();
    });

    it("returns null when Bearer header contains only empty whitespace", () => {
      const req = new Request("http://127.0.0.1/rpc", {
        headers: { authorization: "Bearer   " },
      });
      expect(presentedToken(req)).toBeNull();
    });
  });

  describe("readInternalToken", () => {
    it("returns trimmed token when RPC_INTERNAL_TOKEN is set", () => {
      process.env["RPC_INTERNAL_TOKEN"] = "  secure-secret-token  ";
      expect(readInternalToken(mockLogger)).toBe("secure-secret-token");
    });

    it("throws error in production when RPC_INTERNAL_TOKEN is unset", () => {
      delete process.env["RPC_INTERNAL_TOKEN"];
      process.env["NODE_ENV"] = "production";

      expect(() => readInternalToken(mockLogger)).toThrowError(
        /Missing: RPC_INTERNAL_TOKEN/,
      );
    });

    it("logs warning and returns null in non-production when token is unset", () => {
      delete process.env["RPC_INTERNAL_TOKEN"];
      process.env["NODE_ENV"] = "development";

      const token = readInternalToken(mockLogger);
      expect(token).toBeNull();
      expect(mockLogger).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("RPC_INTERNAL_TOKEN is unset"),
      );
    });
  });

  describe("handleRpcHttpRequest (HTTP Endpoints & Status Codes)", () => {
    const TEST_TOKEN = "test-internal-rpc-secret-token";

    it("returns 200 OK on GET /healthz without authentication", async () => {
      const req = new Request("http://127.0.0.1/healthz", { method: "GET" });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("ok");
    });

    it("returns 404 on POST /healthz", async () => {
      const req = new Request("http://127.0.0.1/healthz", { method: "POST" });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    });

    it("returns 404 on GET /rpc", async () => {
      const req = new Request("http://127.0.0.1/rpc", { method: "GET" });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    });

    it("returns 404 on unknown routes", async () => {
      const req = new Request("http://127.0.0.1/unknown-path", { method: "POST" });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found");
    });

    it("returns 401 Unauthorized when missing Authorization header", async () => {
      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "1", action: "testAction" }),
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ id: "", ok: false, error: "Unauthorized" });
    });

    it("returns 401 Unauthorized when Authorization token is invalid", async () => {
      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({ id: "1", action: "testAction" }),
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ id: "", ok: false, error: "Unauthorized" });
    });

    it("returns 401 Unauthorized when Authorization header is not Bearer", async () => {
      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic invalid-credentials",
        },
        body: JSON.stringify({ id: "1", action: "testAction" }),
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ id: "", ok: false, error: "Unauthorized" });
    });

    it("returns 400 Bad Request when JSON body is malformed", async () => {
      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: "{ malformed json...",
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ id: "", ok: false, error: "Malformed JSON body" });
    });

    it("returns 400 Bad Request when action is missing from request body", async () => {
      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({ id: "req-123" }),
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ id: "req-123", ok: false, error: "Missing action" });
    });

    it("dispatches request and returns 200 when valid bearer token and payload provided", async () => {
      registerRpcHandler("ping", async (req) => ({ pong: true, received: (req as any).payload }));

      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          id: "req-999",
          action: "ping",
          payload: { foo: "bar" },
        }),
      });
      const res = await handleRpcHttpRequest(req, TEST_TOKEN);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        id: "req-999",
        ok: true,
        data: { pong: true, received: { foo: "bar" } },
      });
    });

    it("allows unauthenticated requests in development mode when token is unset", async () => {
      registerRpcHandler("status", async () => ({ online: true }));

      const req = new Request("http://127.0.0.1/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "dev-req", action: "status" }),
      });
      const res = await handleRpcHttpRequest(req, null);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        id: "dev-req",
        ok: true,
        data: { online: true },
      });
    });
  });

  describe("startRpcHttpServer (Server lifecycle and error handling)", () => {
    const originalBun = (globalThis as any).Bun;

    afterEach(() => {
      (globalThis as any).Bun = originalBun;
    });

    it("starts server with configured host and port", async () => {
      process.env["RPC_HTTP_HOST"] = "127.0.0.1";
      process.env["RPC_HTTP_PORT"] = "8099";
      process.env["RPC_INTERNAL_TOKEN"] = "my-secret-token";

      const mockServer = { port: 8099, hostname: "127.0.0.1", stop: vi.fn() };
      const mockServe = vi.fn().mockReturnValue(mockServer);
      (globalThis as any).Bun = { serve: mockServe };

      const server = await startRpcHttpServer(mockLogger);

      expect(server).toBe(mockServer);
      expect(mockServe).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "127.0.0.1",
          port: 8099,
          fetch: expect.any(Function),
        }),
      );
      expect(mockLogger).toHaveBeenCalledWith(
        "info",
        "[RpcHttp] Internal RPC HTTP server listening",
        {
          host: "127.0.0.1",
          port: 8099,
          authenticated: true,
        },
      );
    });

    it("retries on bind failure and succeeds on subsequent attempt", async () => {
      process.env["RPC_HTTP_HOST"] = "127.0.0.1";
      process.env["RPC_HTTP_PORT"] = "8091";

      const mockServer = { port: 8091, hostname: "127.0.0.1", stop: vi.fn() };
      let attempts = 0;
      const mockServe = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          throw new Error("EADDRINUSE: address already in use");
        }
        return mockServer;
      });
      (globalThis as any).Bun = { serve: mockServe };

      const server = await startRpcHttpServer(mockLogger, 3, 10);

      expect(server).toBe(mockServer);
      expect(mockServe).toHaveBeenCalledTimes(2);
      expect(mockLogger).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("Failed to bind internal RPC HTTP server on attempt 1/3"),
        expect.anything(),
      );
      expect(mockLogger).toHaveBeenCalledWith(
        "info",
        "[RpcHttp] Internal RPC HTTP server listening",
        expect.anything(),
      );
    });

    it("handles server startup error gracefully after all retries fail", async () => {
      process.env["RPC_HTTP_HOST"] = "127.0.0.1";
      process.env["RPC_HTTP_PORT"] = "8091";

      const mockServe = vi.fn().mockImplementation(() => {
        throw new Error("EADDRINUSE: address already in use");
      });
      (globalThis as any).Bun = { serve: mockServe };

      const failedServer = await startRpcHttpServer(mockLogger, 2, 10);

      expect(failedServer).toBeNull();
      expect(mockServe).toHaveBeenCalledTimes(2);
      expect(mockLogger).toHaveBeenCalledWith(
        "error",
        "[RpcHttp] Failed to start internal RPC HTTP server",
        expect.objectContaining({
          host: "127.0.0.1",
          port: 8091,
          error: "EADDRINUSE: address already in use",
        }),
      );
    });
  });
});
