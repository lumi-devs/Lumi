import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "@lumi/lib/services.js";
import {
  addInteractionDef,
  type InteractionDef,
} from "@lumi/lib/interactions/interaction-def.js";
import { dispatchInteraction } from "@lumi/lib/interactions/interaction-dispatch.js";
import type { Container } from "@lumi/lib/services.js";

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@lumi/lib/permissions/index.js", () => ({
  hasRequiredPermit: vi.fn().mockResolvedValue(true),
}));

vi.mock("@lumi/application/services/utility/media-utils.js", () => ({
  handleMediaRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lumi/modules/afk/data/afk.js", () => ({
  getAfkMentions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lumi/application/services/tempvc/panel-guard.js", () => ({
  resolveVc: vi.fn().mockResolvedValue(null),
  resolveOwnedVc: vi.fn().mockResolvedValue(null),
  resolveOwnedRecord: vi.fn().mockResolvedValue(null),
}));

function buttonInteraction(customId: string, guildId = "g-1") {
  return {
    isChatInputCommand: () => false,
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    isAutocomplete: () => false,
    isRepliable: () => false,
    id: `i-${customId}`,
    customId,
    guildId,
    guild: { id: guildId, ownerId: "owner-1" },
    user: { id: "u-1" },
    member: null,
    channelId: "c-1",
    inGuild: () => true,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("interaction dispatch guards on per-guild module state", () => {
  const isModuleEnabled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    isModuleEnabled.mockResolvedValue(true);
    (container as any).logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    (container as any).permitResolver = { hasPermit: vi.fn().mockResolvedValue(true) };
    (container as any).db = {
      moderation: { resetWarnThresholds: vi.fn().mockResolvedValue(undefined) },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function dispatch(def: InteractionDef, customId: string) {
    addInteractionDef(def);
    isModuleEnabled.mockResolvedValue(false);
    const services = {
      logger: (container as any).logger,
      db: { modules: { isModuleEnabled } },
    } as unknown as Container;
    await dispatchInteraction(services, buttonInteraction(customId) as any);
  }

  it("security panic revert skips work when security is disabled", async () => {
    const { panicRevert } = await import(
      "@lumi/modules/security/interactions/buttons/panic.js"
    );
    const { PanicRevertId } = await import("@lumi/modules/security/ui/panic-card.js");
    await dispatch(panicRevert, PanicRevertId);
    expect((container as any).permitResolver.hasPermit).not.toHaveBeenCalled();
  });

  it("utility media view skips work when utility is disabled", async () => {
    const { handleMediaRequest } = await import(
      "@lumi/application/services/utility/media-utils.js"
    );
    const mod = await import("@lumi/modules/utility/interactions/buttons/view.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { UserMediaViewId } = await import(
      "@lumi/modules/utility/constants.js"
    );
    await dispatch(
      def,
      UserMediaViewId.build({ userId: "u-1", type: "avatar" }),
    );
    expect(handleMediaRequest).not.toHaveBeenCalled();
  });

  it("afk mentions skips work when afk is disabled", async () => {
    const { getAfkMentions } = await import("@lumi/modules/afk/data/afk.js");
    const mod = await import("@lumi/modules/afk/interactions/buttons/mentions.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { AfkMentionsId } = await import("@lumi/modules/afk/constants.js");
    await dispatch(
      def,
      AfkMentionsId.build({ userId: "u-1", page: "0" }),
    );
    expect(getAfkMentions).not.toHaveBeenCalled();
  });

  it("tempvc panel button skips work when tempvc is disabled", async () => {
    const { resolveOwnedVc } = await import(
      "@lumi/application/services/tempvc/panel-guard.js"
    );
    const { tempVcPanelButton } = await import(
      "@lumi/modules/tempvc/interactions/buttons/tempvc-panel-button.js"
    );
    const { TempVcPanelId } = await import("@lumi/modules/tempvc/constants.js");
    await dispatch(
      tempVcPanelButton,
      TempVcPanelId.build({ action: "panel", channelId: "c-1" }),
    );
    expect(resolveOwnedVc).not.toHaveBeenCalled();
  });
});
