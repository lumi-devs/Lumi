import {
  VerificationModes,
  ageButtonCustomId,
  ageModalCustomId,
  emptySetupState,
  finishCustomId,
  normalizeSetupState,
  parseMinAgeHours,
  stateFromSegments,
  segmentsFromState,
  stepCustomId,
  type SetupWizardState,
} from "#modules/core/lib/setup-wizard.js";
import {
  SetupTotalSteps,
  buildSetupReviewView,
  buildSetupStepView,
  buildSetupSuccessCard,
  setupProgressLines,
} from "#modules/core/ui/setup-wizard.js";
import type { CardReply } from "#utilities/cards.js";
import { describe, expect, it } from "vitest";

type JsonNode = Record<string, any>;

const isRecord = (node: unknown): node is JsonNode =>
  typeof node === "object" && node !== null;

const walk = (node: unknown, out: JsonNode[] = []): JsonNode[] => {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return out;
  }
  if (isRecord(node)) {
    out.push(node);
    for (const value of Object.values(node)) walk(value, out);
  }
  return out;
};

const root = (card: CardReply): unknown => card.components[0]?.toJSON();

const customIds = (card: CardReply): string[] =>
  walk(root(card))
    .map((node) => node.custom_id)
    .filter((id) => typeof id === "string");

const nodeByCustomId = (
  card: CardReply,
  customId: string,
): JsonNode | undefined =>
  walk(root(card)).find((node) => node.custom_id === customId);

const selectOptions = (select: JsonNode | undefined): JsonNode[] => {
  if (!select || !Array.isArray(select.options)) return [];
  return select.options.filter(isRecord);
};

const textOf = (card: CardReply): string =>
  walk(root(card))
    .filter((node) => node.type === 10 && typeof node.content === "string")
    .map((node) => node.content as string)
    .join("\n");

const componentCount = (card: CardReply): number =>
  walk(root(card)).filter((node) => typeof node.type === "number").length;

const fullState = (): SetupWizardState => ({
  logChannelId: "123456789012345678",
  verificationMode: "emoji",
  joinGateEnabled: true,
  minAgeHours: 24,
});

describe("setup-wizard state codec", () => {
  it("round-trips every field through segments", () => {
    const state = fullState();
    expect(stateFromSegments(segmentsFromState(state))).toEqual(state);
  });

  it("treats missing or unknown segments as unset", () => {
    expect(stateFromSegments([])).toEqual(emptySetupState());
    expect(
      stateFromSegments(["log", "skip", "mode", "skip", "gate", "x", "age", "x"]),
    ).toEqual(emptySetupState());
    expect(stateFromSegments(["bogus", "1", "gate", "9"])).toEqual(
      emptySetupState(),
    );
  });

  it("keeps every custom id inside the 100-char limit", () => {
    const big: SetupWizardState = {
      logChannelId: "12345678901234567890",
      verificationMode: "emoji",
      joinGateEnabled: true,
      minAgeHours: 8760,
    };
    for (const id of [
      stepCustomId(3, big),
      finishCustomId(big),
      ageButtonCustomId(big),
      ageModalCustomId(big),
    ]) {
      expect(id.length).toBeLessThanOrEqual(100);
    }
  });

  it("normalizes undecided gates to off and drops the age", () => {
    expect(normalizeSetupState(emptySetupState())).toEqual({
      logChannelId: null,
      verificationMode: null,
      joinGateEnabled: false,
      minAgeHours: null,
    });
    expect(
      normalizeSetupState({ ...emptySetupState(), joinGateEnabled: true }),
    ).toMatchObject({ joinGateEnabled: true, minAgeHours: 24 });
  });

  it("validates the min-age modal input", () => {
    expect(parseMinAgeHours("24")).toEqual({ value: 24 });
    expect(parseMinAgeHours("0")).toEqual({ value: 0 });
    expect(parseMinAgeHours("8760")).toEqual({ value: 8760 });
    expect(parseMinAgeHours("8761").error).toBeDefined();
    expect(parseMinAgeHours("abc").error).toBeDefined();
    expect(parseMinAgeHours("1.5").error).toBeDefined();
    expect(parseMinAgeHours("").error).toBeDefined();
    expect(parseMinAgeHours(undefined).error).toBeDefined();
  });

  it("covers the documented verification modes", () => {
    expect([...VerificationModes]).toEqual(["emoji", "none", "web"]);
  });
});

describe("setup-wizard step views", () => {
  it("spans four steps with a checklist", () => {
    expect(SetupTotalSteps).toBe(4);
    const lines = setupProgressLines(1, emptySetupState());
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.startsWith("·"))).toBe(true);
  });

  it("marks decided steps with a check", () => {
    const lines = setupProgressLines(4, fullState());
    expect(lines.filter((line) => line.startsWith("✓"))).toHaveLength(3);
    expect(lines[3]).toContain("Review");
  });

  it("opens step one with a channel picker and a skip", () => {
    const card = buildSetupStepView(1, emptySetupState());
    const picker = nodeByCustomId(card, "setup:step:1:ch");
    expect(picker).toBeDefined();
    expect(picker!.type).toBe(8);
    expect(picker!.max_values).toBe(1);
    expect(textOf(card)).toContain("· Log channel — pending");
  });

  it("offers every verification level on step two", () => {
    const card = buildSetupStepView(
      2,
      { ...emptySetupState(), logChannelId: "123456789012345678" },
    );
    const ids = customIds(card);
    const selectId = ids.find((id) => id.endsWith(":vmode"))!;
    expect(selectId).toBeDefined();
    expect(selectId.startsWith("setup:step:2:")).toBe(true);
    const values = selectOptions(nodeByCustomId(card, selectId)).map(
      (o) => o.value,
    );
    expect(values).toEqual(["emoji", "none", "web"]);
  });

  it("toggles the join gate and opens the age modal on step three", () => {
    const card = buildSetupStepView(3, {
      ...emptySetupState(),
      verificationMode: "emoji",
    });
    const ids = customIds(card);
    expect(ids.filter((id) => id.startsWith("setup:step:3:"))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith("setup:agebtn:"))).toHaveLength(1);
    expect(ids.find((id) => id.startsWith("setup:step:4:"))).toBeDefined();
    expect(ids.find((id) => id.startsWith("setup:step:2:"))).toBeDefined();
  });

  it("reviews the settled values with a finish button", () => {
    const card = buildSetupReviewView(fullState());
    const ids = customIds(card);
    const finishId = ids.find((id) => id.startsWith("setup:finish:"))!;
    expect(finishId).toBeDefined();
    expect(nodeByCustomId(card, finishId)?.label).toBe("Finish");
    const body = textOf(card);
    expect(body).toContain("<#123456789012345678>");
    expect(body).toContain("Emoji captcha");
    expect(body).toContain("24h");
  });

  it("celebrates with a hub shortcut", () => {
    const card = buildSetupSuccessCard(fullState());
    expect(nodeByCustomId(card, "lumi:tab:home")).toBeDefined();
    expect(textOf(card)).toContain("Setup Complete");
  });

  it("keeps one step per message inside the 40-component budget", () => {
    const states: SetupWizardState[] = [emptySetupState(), fullState()];
    const cards = [
      ...states.flatMap((state) => [
        buildSetupStepView(1, state),
        buildSetupStepView(2, state),
        buildSetupStepView(3, state),
        buildSetupReviewView(state),
        buildSetupSuccessCard(state),
      ]),
    ];
    for (const card of cards) {
      expect(componentCount(card)).toBeLessThanOrEqual(40);
    }
  });
});
