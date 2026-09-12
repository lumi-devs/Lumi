import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import * as navigation from "next/navigation";
import { RpcFailureCodes } from "@lumi/contracts";
import { RpcError } from "#/lib/rpc";
import GuildError from "#/app/guild/[guildId]/error";

describe("GuildError Boundary", () => {
  beforeEach(() => {
    vi.spyOn(navigation, "useParams").mockReturnValue({ guildId: "guild-123" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("Error discrimination", () => {
    it("renders InviteNeeded when error is an RpcError with GuildNotFound", () => {
      const error = new RpcError(RpcFailureCodes.GuildNotFound, "guild.get", "Guild not found");
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText("Lumi isn’t in this server yet")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Invite Lumi/ })).toBeInTheDocument();
      expect(screen.getByText("guild-123")).toBeInTheDocument();
    });

    it("renders GuildUnavailable when error is an RpcError with TIMEOUT", () => {
      const error = new RpcError("TIMEOUT", "guild.get", "RPC timed out: guild.get");
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
      expect(screen.getByText("guild-123")).toBeInTheDocument();
      expect(screen.queryByText("Lumi isn’t in this server yet")).not.toBeInTheDocument();
    });

    it("renders GuildUnavailable when error is an RpcError with WORKER_DOWN", () => {
      const error = new RpcError("WORKER_DOWN", "guild.get", "Worker connection refused");
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
      expect(screen.queryByText("Lumi isn’t in this server yet")).not.toBeInTheDocument();
    });

    it("renders GuildUnavailable when error is a generic Error", () => {
      const error = new Error("Something broke in component rendering");
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
      expect(screen.queryByText("Lumi isn’t in this server yet")).not.toBeInTheDocument();
    });

    it("renders GuildUnavailable when error is an RpcError with RPC_ERROR", () => {
      const error = new RpcError("RPC_ERROR", "guild.get", "DB is down");
      render(<GuildError error={error} reset={() => {}} />);

      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
      expect(screen.queryByText("Lumi isn’t in this server yet")).not.toBeInTheDocument();
    });

    it("correctly identifies GUILD_NOT_FOUND on a plain Error (such as deserialized from Server Component)", () => {
      const plainErrorWithCode = new Error("RPC guild.get: GUILD_NOT_FOUND");
      (plainErrorWithCode as any).code = RpcFailureCodes.GuildNotFound;
      render(<GuildError error={plainErrorWithCode} reset={() => {}} />);

      expect(screen.getByText("Lumi isn’t in this server yet")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Invite Lumi/ })).toBeInTheDocument();
    });
  });

  describe("Edge cases and exception shapes", () => {
    it("handles error with null/undefined message gracefully", () => {
      const errorWithUndefinedMsg = new Error();
      (errorWithUndefinedMsg as any).message = undefined;
      expect(() => {
        render(<GuildError error={errorWithUndefinedMsg} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles error with empty message gracefully", () => {
      const emptyError = new Error("");
      expect(() => {
        render(<GuildError error={emptyError} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles error with digest property gracefully", () => {
      const errorWithDigest = Object.assign(new Error("Server error"), {
        digest: "NEXT_REDIRECT:12345",
      });
      expect(() => {
        render(<GuildError error={errorWithDigest} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles non-Error objects (unusual shapes)", () => {
      const nonError = { message: "fake error", code: "ERR_SOMETHING" } as unknown as Error;
      expect(() => {
        render(<GuildError error={nonError} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles null error without crashing", () => {
      expect(() => {
        render(<GuildError error={null as unknown as Error} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles undefined error without crashing", () => {
      expect(() => {
        render(<GuildError error={undefined as unknown as Error} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles missing guildId in params ({}) without crashing", () => {
      vi.spyOn(navigation, "useParams").mockReturnValue({});
      const error = new Error("Generic failure");
      expect(() => {
        render(<GuildError error={error} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });

    it("handles missing guildId in params ({}) for InviteNeeded branch without crashing", () => {
      vi.spyOn(navigation, "useParams").mockReturnValue({});
      const error = new RpcError(RpcFailureCodes.GuildNotFound, "guild.get");
      expect(() => {
        render(<GuildError error={error} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi isn’t in this server yet")).toBeInTheDocument();
    });

    it("handles null useParams gracefully without crashing", () => {
      vi.spyOn(navigation, "useParams").mockReturnValue(null as any);
      const error = new Error("Generic failure");
      expect(() => {
        render(<GuildError error={error} reset={() => {}} />);
      }).not.toThrow();
      expect(screen.getByText("Lumi couldn't be reached")).toBeInTheDocument();
    });
  });
});
