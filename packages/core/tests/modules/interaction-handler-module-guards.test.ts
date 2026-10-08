import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { container } from "#lib/services.js";
import * as misc from "#lib/utilities/misc.js";
import {
  addInteractionDef,
  type InteractionDef,
} from "#lib/interactions/interaction-def.js";
import { dispatchInteraction } from "#lib/interactions/interaction-dispatch.js";
import type { Container } from "#lib/services.js";

vi.mock("#lib/i18n/index.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/permissions/index.js", () => ({
  hasRequiredPermit: vi.fn().mockResolvedValue(true),
}));

vi.mock("@lumi/application/services/utility/media-utils.js", () => ({
  handleMediaRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#modules/afk/data/afk.js", () => ({
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
  let isModuleEnabled: ReturnType<typeof vi.spyOn<typeof misc, "isModuleEnabled">>;

  beforeEach(() => {
    vi.clearAllMocks();
    isModuleEnabled = vi.spyOn(misc, "isModuleEnabled");
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

  // vi.spyOn mutates the shared misc module object: restore the real
  // implementation so later test files see real misc.js behavior.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function dispatch(def: InteractionDef, customId: string) {
    addInteractionDef(def);
    isModuleEnabled.mockResolvedValue(false);
    const services = {
      logger: (container as any).logger,
    } as unknown as Container;
    await dispatchInteraction(services, buttonInteraction(customId) as any);
  }

  it("security panic revert skips work when security is disabled", async () => {
    const { panicRevert } = await import(
      "#modules/security/interactions/buttons/panic.js"
    );
    const { PanicRevertId } = await import("#modules/security/ui/panic-card.js");
    await dispatch(panicRevert, PanicRevertId);
    expect((container as any).permitResolver.hasPermit).not.toHaveBeenCalled();
  });

  it("utility media view skips work when utility is disabled", async () => {
    const { handleMediaRequest } = await import(
      "@lumi/application/services/utility/media-utils.js"
    );
    const mod = await import("#modules/utility/interactions/buttons/view.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { UserMediaViewId } = await import(
      "#modules/utility/constants.js"
    );
    await dispatch(
      def,
      UserMediaViewId.build({ userId: "u-1", type: "avatar" }),
    );
    expect(handleMediaRequest).not.toHaveBeenCalled();
  });

  it("afk mentions skips work when afk is disabled", async () => {
    const { getAfkMentions } = await import("#modules/afk/data/afk.js");
    const mod = await import("#modules/afk/interactions/buttons/mentions.js");
    const def = (mod.default ?? Object.values(mod)[0]) as InteractionDef;
    const { AfkMentionsId } = await import("#modules/afk/constants.js");
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
      "#modules/tempvc/interactions/buttons/tempvc-panel-button.js"
    );
    const { TempVcPanelId } = await import("#modules/tempvc/constants.js");
    await dispatch(
      tempVcPanelButton,
      TempVcPanelId.build({ action: "panel", channelId: "c-1" }),
    );
    expect(resolveOwnedVc).not.toHaveBeenCalled();
  });
});
