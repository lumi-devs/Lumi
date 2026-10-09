import { describe, it, expect, beforeEach } from "bun:test";
import {
  addInteractionDef,
  clearInteractionDefsForTest,
  defineInteraction,
  interactionDefs,
} from "#lib/interactions/interaction-def.js";
import { dispatchInteraction } from "#lib/interactions/interaction-dispatch.js";

function fakeInteraction(kind: "button" | "select", customId: string) {
  return {
    customId,
    isButton: () => kind === "button",
    isAnySelectMenu: () => kind === "select",
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
  };
}

describe("interaction kind routing", () => {
  beforeEach(() => clearInteractionDefsForTest());

  it("keeps button and select handlers sharing one prefix and routes by kind", async () => {
    const seen: string[] = [];
    addInteractionDef(
      defineInteraction({
        prefix: "cfg",
        kinds: ["button"],
        run: () => void seen.push("button"),
      }),
    );
    addInteractionDef(
      defineInteraction({
        prefix: "cfg",
        kinds: ["select"],
        run: () => void seen.push("select"),
      }),
    );
    expect(interactionDefs()).toHaveLength(2);

    await dispatchInteraction({} as never, fakeInteraction("button", "cfg:ch:mod:key") as never);
    await dispatchInteraction({} as never, fakeInteraction("select", "cfg:ch:mod:key") as never);
    expect(seen).toEqual(["button", "select"]);
  });

  it("still drops an exact duplicate with overlapping kinds", () => {
    addInteractionDef(defineInteraction({ prefix: "dup", run: () => undefined }));
    addInteractionDef(defineInteraction({ prefix: "dup", run: () => undefined }));
    expect(interactionDefs()).toHaveLength(1);
  });
});
