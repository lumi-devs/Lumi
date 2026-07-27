import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { container } from "@sapphire/framework";
import { ButtonStyle } from "discord.js";
import {
  isAutoRestartEnabled,
  restartChoiceRow,
  scheduleProcessRestart,
} from "#lib/restart.js";

describe("Bot Restart & State Management Utilities", () => {
  const originalEnv = process.env.MODULE_UPDATE_AUTO_RESTART;

  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.MODULE_UPDATE_AUTO_RESTART = originalEnv;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("isAutoRestartEnabled", () => {
    it("returns true by default when env var is not set", () => {
      delete process.env.MODULE_UPDATE_AUTO_RESTART;
      expect(isAutoRestartEnabled()).toBe(true);
    });

    it("returns true when env var is set to 'true' or 'TRUE'", () => {
      process.env.MODULE_UPDATE_AUTO_RESTART = "true";
      expect(isAutoRestartEnabled()).toBe(true);

      process.env.MODULE_UPDATE_AUTO_RESTART = "TRUE";
      expect(isAutoRestartEnabled()).toBe(true);
    });

    it("returns false when env var is set to 'false' or 'False'", () => {
      process.env.MODULE_UPDATE_AUTO_RESTART = "false";
      expect(isAutoRestartEnabled()).toBe(false);

      process.env.MODULE_UPDATE_AUTO_RESTART = "False";
      expect(isAutoRestartEnabled()).toBe(false);
    });
  });

  describe("restartChoiceRow", () => {
    it("builds action row with restart and cancel buttons for given userId", () => {
      const userId = "user-123456";
      const row = restartChoiceRow(userId);
      const json = row.toJSON() as any;

      expect(json.type).toBe(1); // ActionRow component type
      expect(json.components).toHaveLength(2);

      const [btnRestart, btnCancel] = json.components;

      expect(btnRestart.custom_id).toBe(`module:restart:${userId}`);
      expect(btnRestart.label).toBe("Restart Now");
      expect(btnRestart.style).toBe(ButtonStyle.Danger);
      expect(btnRestart.emoji).toEqual({ name: "🔄" });

      expect(btnCancel.custom_id).toBe(`module:restartcancel:${userId}`);
      expect(btnCancel.label).toBe("Cancel");
      expect(btnCancel.style).toBe(ButtonStyle.Secondary);
    });
  });

  describe("scheduleProcessRestart", () => {
    it("schedules process restart and is idempotent when called multiple times", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      // Explicit assertion for isAutoRestartEnabled status
      expect(isAutoRestartEnabled()).toBe(true);

      // First call schedules restart
      scheduleProcessRestart("First attempt", 1500);

      // Second call should be ignored (idempotent)
      scheduleProcessRestart("Second attempt", 1500);

      expect(container.logger.warn).toHaveBeenCalledWith(
        "[Restart] Scheduling graceful restart in 1500ms — First attempt"
      );
      expect(container.logger.warn).not.toHaveBeenCalledWith(
        "[Restart] Scheduling graceful restart in 1500ms — Second attempt"
      );
      expect(killSpy).not.toHaveBeenCalled();

      // Advance timers to trigger process.kill
      vi.advanceTimersByTime(1500);

      expect(container.logger.warn).toHaveBeenCalledWith(
        `[Restart] Sending SIGTERM to self (pid ${process.pid})`
      );

      // Explicit assertions for scheduleProcessRestart call counts / killSpy calls
      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
    });
  });
});
