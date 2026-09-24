import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import * as navigation from "next/navigation";
import { RpcFailureCodes } from "@lumi/contracts/rpc";
import { RpcError } from "#/lib/rpc";
import GuildError from "#/app/guild/[guildId]/error";

const Unavailable = "Lumi couldn't be reached";

describe("GuildError Boundary", () => {
  beforeEach(() => {
    vi.spyOn(navigation, "useParams").mockReturnValue({ guildId: "guild-123" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("renders GuildUnavailable for every error that reaches the boundary", () => {
    it.each([
      ["GuildNotFound RpcError", new RpcError(RpcFailureCodes.GuildNotFound, "guild.get", "Guild not found")],
      ["TIMEOUT RpcError", new RpcError("TIMEOUT", "guild.get", "RPC timed out: guild.get")],
      ["WORKER_DOWN RpcError", new RpcError("WORKER_DOWN", "guild.get", "Worker connection refused")],
      ["HANDLER_ERROR RpcError", new RpcError(RpcFailureCodes.HandlerError, "guild.get", "DB is down")],
      ["generic Error", new Error("Something broke in component rendering")],
    ])("%s", (_label, error) => {
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText(Unavailable)).toBeInTheDocument();
      expect(screen.getByText("guild-123")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Invite Lumi/ })).not.toBeInTheDocument();
    });
  });

  describe("Edge cases and exception shapes", () => {
    it("handles error with undefined message", () => {
      const error = new Error();
      (error as any).message = undefined;
      expect(() => render(<GuildError error={error} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });

    it("handles error with digest property", () => {
      const error = Object.assign(new Error("Server error"), { digest: "NEXT_REDIRECT:12345" });
      expect(() => render(<GuildError error={error} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });

    it("handles non-Error objects", () => {
      const nonError = { message: "fake error", code: "ERR_SOMETHING" } as unknown as Error;
      expect(() => render(<GuildError error={nonError} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
    ])("handles %s error without crashing", (_label, error) => {
      expect(() => render(<GuildError error={error as unknown as Error} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });

    it("handles missing guildId in params", () => {
      vi.spyOn(navigation, "useParams").mockReturnValue({});
      expect(() => render(<GuildError error={new Error("Generic failure")} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });

    it("handles null useParams", () => {
      vi.spyOn(navigation, "useParams").mockReturnValue(null as any);
      expect(() => render(<GuildError error={new Error("Generic failure")} reset={() => {}} />)).not.toThrow();
      expect(screen.getByText(Unavailable)).toBeInTheDocument();
    });
  });
});
