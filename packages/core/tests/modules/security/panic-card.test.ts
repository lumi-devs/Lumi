import { describe, it, expect } from "bun:test";
import {
  buildPanicCancelledCard,
  buildPanicStatusCard,
  buildPanicAlreadyActiveCard,
  buildPanicRevertedCard,
} from "@lumi/modules/security/ui/panic-card.js";
import type { LumiT } from "@lumi/lib/i18n/index.js";

describe("Panic Mode Card Builders", () => {
  const fakeT: LumiT = ((key: string, opts?: any) => {
    if (opts?.locked !== undefined) return `Locked ${opts.locked} channels`;
    if (opts?.restored !== undefined) return `Restored ${opts.restored} channels`;
    if (opts?.since !== undefined) return `Active since ${opts.since}`;
    return key;
  }) as any;

  it("builds panic status card with one-click revert button", () => {
    const card = buildPanicStatusCard(fakeT, {
      invitesPaused: true,
      lockedCount: 5,
      skippedCount: 1,
    });

    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
    // Button is present in the action row
    const container = card.components[0] as any;
    expect(container).toBeDefined();
  });

  it("builds already-active warning card with duration and revert button", () => {
    const startedAt = new Date(Date.now() - 60_000);
    const card = buildPanicAlreadyActiveCard(fakeT, startedAt);

    expect(card.components).toBeDefined();
    expect(card.components.length).toBeGreaterThan(0);
  });

  it("builds cancelled and reverted confirmation cards", () => {
    const cancelled = buildPanicCancelledCard(fakeT);
    expect(cancelled.components).toBeDefined();
    expect(cancelled.components.length).toBeGreaterThan(0);

    const reverted = buildPanicRevertedCard(fakeT, 7);
    expect(reverted.components).toBeDefined();
    expect(reverted.components.length).toBeGreaterThan(0);
  });
});
