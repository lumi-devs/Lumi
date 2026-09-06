import {
  FieldType,
  type ConfigField,
  type ModuleMeta,
} from "#lib/module-system/Module.js";
import {
  FeaturesPerPage,
  FieldsPerPage,
  buildFeatureDetailView,
  buildFeatureListView,
  buildFieldEditView,
} from "#modules/core/ui/modules.js";
import type { CardReply } from "#utilities/cards.js";
import { resolveCardColor } from "#utilities/cards.js";
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

const accentOf = (card: CardReply): unknown => {
  const json = root(card);
  return isRecord(json) ? json.accent_color : undefined;
};

const sampleMeta = (fields: ConfigField[]): ModuleMeta => ({
  name: "moderation",
  displayName: "Moderation",
  emoji: "🛡️",
  description: "Keep the server safe.",
  version: "1.0.0",
  configFields: fields,
});

const boolField: ConfigField = {
  key: "flag",
  label: "Enabled flag",
  type: FieldType.BOOLEAN,
  description: "Flip it.",
  default: false,
};

const textField: ConfigField = {
  key: "title",
  label: "Title",
  type: FieldType.STRING,
  description: "Header text.",
};

const durationField: ConfigField = {
  key: "slowmode",
  label: "Slowmode",
  type: FieldType.DURATION,
  description: "How long.",
};

const enumField: ConfigField = {
  key: "mode",
  label: "Mode",
  type: FieldType.ENUM,
  description: "Pick one.",
  choices: ["off", "strict"],
  default: "off",
};

const channelField: ConfigField = {
  key: "logChannel",
  label: "Log channel",
  type: FieldType.CHANNEL,
  description: "Where logs go.",
};

const multiRoleField: ConfigField = {
  key: "managerRoles",
  label: "Managers",
  type: FieldType.MULTI_ROLE,
  description: "Who can manage.",
};

const multiUserField: ConfigField = {
  key: "watchUsers",
  label: "Watch Users",
  type: FieldType.MULTI_USER,
  description: "Who to watch.",
};

const stringListField: ConfigField = {
  key: "badTerms",
  label: "Bad Terms",
  type: FieldType.STRING_LIST,
  description: "Terms to block.",
};

describe("config-panel list view", () => {
  it("keeps the page budgets", () => {
    expect(FeaturesPerPage).toBe(4);
    expect(FieldsPerPage).toBe(5);
  });

  it("renders one Open row per feature with a status glyph", () => {
    const features = Array.from({ length: 5 }, (_, i) => ({
      meta: {
        ...sampleMeta([]),
        name: `mod${i}`,
        displayName: `Mod ${i}`,
      },
      guildEnabled: i % 2 === 0,
    }));
    const card = buildFeatureListView(features, 0);
    const sections = walk(root(card)).filter((node) => node.type === 9);
    expect(sections).toHaveLength(FeaturesPerPage);
    expect(customIds(card)).toContain("cfg:open:mod0:0");
    const pageRow = customIds(card).find((id) =>
      id.startsWith("cfg:page:prev:"),
    );
    expect(pageRow).toBeDefined();
    const openButton = nodeByCustomId(card, "cfg:open:mod0:0");
    expect(openButton?.label).toBe("Open");
  });
});

describe("config-panel detail view", () => {
  const meta = sampleMeta([
    boolField,
    enumField,
    textField,
    durationField,
    channelField,
  ]);

  it("wires each editor kind to its own control", () => {
    const card = buildFeatureDetailView(
      meta,
      { flag: true, mode: "strict", title: "Hi" },
      true,
    );
    const ids = customIds(card);
    expect(ids).toContain("cfg:bool:moderation:flag:0");
    expect(ids).toContain("cfg:enum:moderation:mode:0");
    expect(ids).toContain("cfg:fedit:moderation:title:0");
    expect(ids).toContain("cfg:fedit:moderation:slowmode:0");
    expect(ids).toContain("cfg:field:moderation:logChannel:0");
    expect(ids).toContain("cfg:tog:moderation:0");
    expect(ids).toContain("cfg:rst:moderation:0");
    expect(ids).toContain("cfg:back:0");
    expect(ids).toContain("cfg:hist:moderation:0");
    expect(ids.find((id) => id.startsWith("cfg:gsel:"))).toBeUndefined();
  });

  it("preselects the current enum value in place", () => {
    const card = buildFeatureDetailView(meta, { mode: "strict" }, true);
    const options = selectOptions(nodeByCustomId(card, "cfg:enum:moderation:mode:0"));
    expect(options).toHaveLength(2);
    expect(options.find((o) => o.value === "strict")?.default).toBe(true);
  });

  it("colors the container by enabled state", () => {
    expect(accentOf(buildFeatureDetailView(meta, {}, true))).toBe(
      resolveCardColor("primary"),
    );
    expect(accentOf(buildFeatureDetailView(meta, {}, false))).toBe(
      resolveCardColor("warning"),
    );
  });

  it("shows the group jumper and clamps the section index", () => {
    const grouped = sampleMeta([
      { ...textField, key: "one", group: "First" },
      { ...textField, key: "two", group: "Second" },
      { ...textField, key: "three", group: "Second" },
    ]);
    const card = buildFeatureDetailView(grouped, {}, true, 99);
    const options = selectOptions(nodeByCustomId(card, "cfg:gsel:moderation"));
    expect(options).toHaveLength(2);
    expect(options.find((o) => o.value === "1")?.default).toBe(true);
  });

  it("caps ungrouped fields per section", () => {
    const many = sampleMeta(
      Array.from({ length: FieldsPerPage + 1 }, (_, i) => ({
        ...textField,
        key: `field${i}`,
      })),
    );
    const first = buildFeatureDetailView(many, {}, true, 0);
    const sections = walk(root(first)).filter((node) => node.type === 9);
    expect(sections).toHaveLength(FieldsPerPage);
    expect(customIds(first)).toContain("cfg:gsel:moderation");
  });
});

describe("config-panel field edit view", () => {
  const meta = sampleMeta([channelField, multiRoleField]);

  it("allows clearing multi pickers up to 25 values", () => {
    const card = buildFieldEditView(meta, multiRoleField, {}, 0);
    const select = nodeByCustomId(card, "cfg:role:moderation:managerRoles:0");
    expect(select).toBeDefined();
    expect(select!.type).toBe(6);
    expect(select!.min_values).toBe(0);
    expect(select!.max_values).toBe(25);
  });

  it("keeps single pickers at one value", () => {
    const card = buildFieldEditView(meta, channelField, {}, 0);
    const select = nodeByCustomId(card, "cfg:ch:moderation:logChannel:0");
    expect(select).toBeDefined();
    expect(select!.type).toBe(8);
    expect(select!.min_values).toBe(0);
    expect(select!.max_values).toBe(1);
  });

  it("renders multi user pickers up to 25 values", () => {
    const card = buildFieldEditView(meta, multiUserField, {}, 0);
    const select = nodeByCustomId(card, "cfg:user:moderation:watchUsers:0");
    expect(select).toBeDefined();
    expect(select!.type).toBe(5);
    expect(select!.min_values).toBe(0);
    expect(select!.max_values).toBe(25);
  });

  it("routes string lists through the modal editor", () => {
    const card = buildFeatureDetailView(
      sampleMeta([stringListField]),
      { badTerms: ["spam"] },
      true,
    );
    expect(customIds(card)).toContain("cfg:fedit:moderation:badTerms:0");
  });
});
