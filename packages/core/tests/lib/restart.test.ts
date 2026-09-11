import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { container } from "@sapphire/framework";
import { ButtonStyle } from "discord.js";
import {
  restartChoiceRow,
  scheduleProcessRestart,
} from "#lib/restart.js";

// bun:test's fake-timer support only mocks the system clock (Date.now), not
// the setTimeout queue, so this waits on the real clock instead.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Bot Restart & State Management Utilities", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    it("schedules process restart and is idempotent when called multiple times", async () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      scheduleProcessRestart("First attempt", 1500);
      scheduleProcessRestart("Second attempt", 1500);

      expect(container.logger.warn).toHaveBeenCalledWith(
        "[Restart] Scheduling graceful restart in 1500ms - First attempt"
      );
      expect(container.logger.warn).not.toHaveBeenCalledWith(
        "[Restart] Scheduling graceful restart in 1500ms - Second attempt"
      );
      expect(killSpy).not.toHaveBeenCalled();

      await sleep(1500);

      expect(container.logger.warn).toHaveBeenCalledWith(
        `[Restart] Sending SIGTERM to self (pid ${process.pid})`
      );

      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
    });
  });
});
