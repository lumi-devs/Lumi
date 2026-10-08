import { describe, it, expect, vi } from "bun:test";
import {
  buildBackRows,
  buildKickView,
  buildTrustView,
  buildUntrustView,
  buildBlockView,
  buildUnblockView,
  buildTransferView,
  buildDeleteConfirmView,
  buildPanel,
} from "#modules/tempvc/ui/panel.js";
import { container } from "#lib/services.js";

describe("TempVC UI Panel Builders", () => {
  const mockChannel: any = {
    id: "channel-100",
    guildId: "guild-100",
    name: "My Voice Room",
    userLimit: 5,
  };

  const mockRecord: any = {
    channelId: "channel-100",
    ownerId: "user-100",
    name: "My Voice Room",
    locked: false,
    hidden: false,
  };

  it("builds back to panel row", () => {
    const rows = buildBackRows("channel-100");
    expect(rows).toBeDefined();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("builds kick, transfer, and delete confirmation views", () => {
    const kickView = buildKickView(mockChannel, mockRecord);
    expect(kickView.components).toBeDefined();
    expect(kickView.components.length).toBeGreaterThan(0);

    const transferView = buildTransferView(mockChannel, mockRecord);
    expect(transferView.components).toBeDefined();
    expect(transferView.components.length).toBeGreaterThan(0);

    const deleteView = buildDeleteConfirmView(mockChannel);
    expect(deleteView.components).toBeDefined();
    expect(deleteView.components.length).toBeGreaterThan(0);
  });

  it("builds trust, untrust, block, and unblock views", () => {
    const trustView = buildTrustView(mockChannel, mockRecord);
    expect(trustView.components).toBeDefined();

    const untrustView = buildUntrustView(mockChannel, mockRecord);
    expect(untrustView.components).toBeDefined();

    const blockView = buildBlockView(mockChannel, mockRecord);
    expect(blockView.components).toBeDefined();

    const unblockView = buildUnblockView(mockChannel, mockRecord);
    expect(unblockView.components).toBeDefined();
  });

  it("builds the main tempvc control panel with status badges and menus", async () => {
    (container as any).db = {
      config: {
        getModuleConfig: vi.fn().mockResolvedValue(null),
      },
    };

    const panel = await buildPanel(container, mockChannel, mockRecord);
    expect(panel.components).toBeDefined();
    expect(panel.components.length).toBeGreaterThan(0);

    // Also test with locked and hidden record
    const lockedPanel = await buildPanel(container, mockChannel, {
      ...mockRecord,
      locked: true,
      hidden: true,
    });
    expect(lockedPanel.components).toBeDefined();
  });
});
