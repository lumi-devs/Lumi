import { describe, it, expect, vi, beforeEach } from "bun:test";
import { InteractionHandlerTypes } from "@sapphire/framework";

const isModuleEnabled = vi.fn();

vi.mock("#lib/utilities/misc.js", () => ({
  isModuleEnabled,
}));

function pieceContext(name: string) {
  return {
    name,
    path: `/virtual/${name}.ts`,
    root: "/virtual",
    store: { name: "interaction-handlers" } as any,
  };
}

describe("lib/interactions ModuleInteractionHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function makeHandler() {
    const { ModuleInteractionHandler } = await import(
      "#lib/interactions/ModuleInteractionHandler.js"
    );
    class TestHandler extends ModuleInteractionHandler<any, { value: string }> {
      public handleCalls: Array<[any, { value: string }]> = [];

      public override parse() {
        return this.none();
      }

      protected override handle(interaction: any, parsed: { value: string }): void {
        this.handleCalls.push([interaction, parsed]);
      }
    }
    return new TestHandler(pieceContext("test-handler"), {
      name: "test-handler",
      interactionHandlerType: InteractionHandlerTypes.Button,
      module: "tempvc",
    });
  }

  it("exposes the module name getter", async () => {
    const handler = await makeHandler();
    expect(handler.module).toBe("tempvc");
  });

  it("does not call handle when there is no guild id", async () => {
    const handler = await makeHandler();
    isModuleEnabled.mockResolvedValue(true);

    await handler.run({ guildId: null, guild: null } as any, { value: "a" });
    expect(handler.handleCalls).toHaveLength(0);
    expect(isModuleEnabled).not.toHaveBeenCalled();
  });

  it("does not call handle when the module is disabled", async () => {
    const handler = await makeHandler();
    isModuleEnabled.mockResolvedValue(false);

    await handler.run({ guildId: "g-1", guild: null } as any, { value: "a" });
    expect(handler.handleCalls).toHaveLength(0);
    expect(isModuleEnabled).toHaveBeenCalledWith("g-1", "tempvc");
  });

  it("calls handle with the interaction and parsed data when enabled", async () => {
    const handler = await makeHandler();
    isModuleEnabled.mockResolvedValue(true);

    const interaction = { guildId: "g-1", guild: null };
    await handler.run(interaction as any, { value: "a" });
    expect(handler.handleCalls).toHaveLength(1);
    expect(handler.handleCalls[0]).toEqual([interaction, { value: "a" }]);
  });
});
