import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  buildAfkMentionCard,
  buildAfkRemovalCard,
  buildAfkStatusCard,
  formatAfkDuration,
  sanitizeAfkReason,
} from "../../modules/utility/afk/ui.ts";

const containerOf = (card: any) =>
  JSON.parse(JSON.stringify(card.components[0]));

describe("afk cards", () => {
  it("renders the set status card", () => {
    const card = buildAfkStatusCard("set", "Lunch");
    const container = containerOf(card);

    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(card).not.toHaveProperty("embeds");
    expect(container.accent_color).toBeUndefined();
    expect(container.components.map((component: any) => component.type)).toEqual([
      10, 14, 10,
    ]);
    expect(container.components[0].content).toBe("**💤 AFK Set**");
    expect(container.components[2].content).toBe(
      "You are now AFK: **Lunch**",
    );
  });

  it("renders the updated status card", () => {
    const container = containerOf(buildAfkStatusCard("updated", "Dinner"));

    expect(container.components[0].content).toBe("**✏️ AFK Updated**");
    expect(container.components[2].content).toBe(
      "AFK reason updated to: **Dinner**",
    );
  });

  it("renders the already-afk status card", () => {
    const container = containerOf(buildAfkStatusCard("already", "Lunch"));

    expect(container.components[0].content).toBe("**💤 Already AFK**");
    expect(container.components[2].content).toBe(
      "You are already AFK with the reason: **Lunch**",
    );
  });

  it("renders the welcome back card", () => {
    const container = containerOf(buildAfkRemovalCard("1h 2m"));

    expect(container.components[0].content).toBe("**👋 Welcome Back!**");
    expect(container.components[2].content).toBe(
      "AFK removed.\nAFK for **1h 2m**.",
    );
  });

  it("renders the who-mentioned card", () => {
    const card = buildAfkMentionCard("Alice", "Lunch", "5m");
    const container = containerOf(card);

    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(card.allowedMentions).toEqual({ repliedUser: true });
    expect(card).not.toHaveProperty("embeds");
    expect(container.accent_color).toBeUndefined();
    expect(container.components[0].content).toBe("## 💤 Alice is AFK");
    expect(container.components[2].content).toBe(
      "**Reason:** Lunch\n**AFK for:** 5m",
    );
  });

  it("formats AFK durations", () => {
    expect(formatAfkDuration(0)).toBe("0s");
    expect(formatAfkDuration(90_000)).toBe("1m 30s");
    expect(formatAfkDuration(3_661_000)).toBe("1h 1m 1s");
    expect(formatAfkDuration(86_400_000)).toBe("1d");
  });

  it("sanitizes AFK reasons", () => {
    expect(sanitizeAfkReason("  lunch\n with   team  ", 200)).toBe(
      "lunch with team",
    );
    expect(sanitizeAfkReason("   ", 200)).toBe("AFK");
    expect(sanitizeAfkReason("abcdef", 3)).toBe("abc");
  });
});
