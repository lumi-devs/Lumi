import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import {
  addInteractionDef,
  type InteractionDef,
} from "#src/lib/interactions/InteractionDef.js";
import { dispatchInteraction } from "#src/lib/interactions/InteractionDispatch.js";
import type { Container } from "#src/lib/Services.js";

vi.mock("#lib/i18n/Index.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/permissions/Index.js", () => ({
  hasRequiredPermit: vi.fn().mockResolvedValue(true),
}));

vi.mock("#src/modules/utility/services/MediaUtils.js", () => ({
  handleMediaRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#src/modules/afk/data/Afk.js", () => ({
  getAfkMentions: vi.fn().mockResolvedValue([]),
}));

vi.mock("#src/modules/tempvc/services/PanelGuard.js", () => ({
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
      "#src/modules/security/interactions/buttons/Panic.js"
    );
    const { PanicRevertId } = await import("#src/modules/security/ui/PanicCard.js");
    await dispatch(panicRevert, PanicRevertId);
    expect((container as any).permitResolver.hasPermit).not.toHaveBeenCalled();
  });

  it("utility media view skips work when utility is disabled", async () => {
    const { handleMediaRequest } = await import(
      "#src/modules/utility/services/MediaUtils.js"
    );
    const mod = await import("#src/modules/utility/interactions/buttons/View.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { UserMediaViewId } = await import(
      "#src/modules/utility/Constants.js"
    );
    await dispatch(
      def,
      UserMediaViewId.build({ userId: "u-1", type: "avatar" }),
    );
    expect(handleMediaRequest).not.toHaveBeenCalled();
  });

  it("afk mentions skips work when afk is disabled", async () => {
    const { getAfkMentions } = await import("#src/modules/afk/data/Afk.js");
    const mod = await import("#src/modules/afk/interactions/buttons/Mentions.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { AfkMentionsId } = await import("#src/modules/afk/Constants.js");
    await dispatch(
      def,
      AfkMentionsId.build({ userId: "u-1", page: "0" }),
    );
    expect(getAfkMentions).not.toHaveBeenCalled();
  });

  it("tempvc panel button skips work when tempvc is disabled", async () => {
    const { resolveOwnedVc } = await import(
      "#src/modules/tempvc/services/PanelGuard.js"
    );
    const { tempVcPanelButton } = await import(
      "#src/modules/tempvc/interactions/buttons/TempvcPanelButton.js"
    );
    const { TempVcPanelId } = await import("#src/modules/tempvc/Constants.js");
    await dispatch(
      tempVcPanelButton,
      TempVcPanelId.build({ action: "panel", channelId: "c-1" }),
    );
    expect(resolveOwnedVc).not.toHaveBeenCalled();
  });
});
