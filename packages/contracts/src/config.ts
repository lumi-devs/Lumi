import type { ChannelType } from "discord.js";

// Module configuration schema contracts.


export enum FieldType {
  Boolean = "BOOLEAN",
  Number = "NUMBER",
  String = "STRING",
  Enum = "ENUM",
  Channel = "CHANNEL",
  Role = "ROLE",
  User = "USER",
  Duration = "DURATION",
  MultiRole = "MULTI_ROLE",
  MultiChannel = "MULTI_CHANNEL",
  MultiUser = "MULTI_USER",
  StringList = "STRING_LIST",
  /** Array of fixed-shape objects (e.g. per-channel sticky entries). */
  ObjectArray = "OBJECT_ARRAY",
  /** A `MessageDocumentV2` (see `message-blocks.ts`): an ordered list of real
   * Components V2 blocks — Section, MediaGallery, Separator, ActionRow —
   * edited with the visual block builder rather than a flat string. */
  ComponentsV2Blocks = "COMPONENTS_V2_BLOCKS",
}

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  default?: unknown;
  choices?: string[];
  required?: boolean;
  /** For CHANNEL fields: restrict the channel-type picker. */
  channelTypes?: ChannelType[];
  /** CHANNEL fields whose target the bot may not be able to enumerate (private
   * channels, threads). Opts the field into the claim-code flow, where an
   * operator proves ownership by posting a code in the channel. */
  claimable?: boolean;
  /** NUMBER fields with `step` render as a range slider instead of a number box. */
  step?: number;
  /** NUMBER bounds. These are the range the module itself validates, so the
   * control must not let a value outside them be submitted. */
  min?: number;
  max?: number;
  /** DURATION quick-pick presets (e.g. `["5m", "15m", "1h", "24h", "7d"]`). */
  quickPicks?: string[];
  /** Section this field belongs to in the config panel. Fields sharing a group
   * render together as one navigable subsection; omit for small modules. */
  group?: string;
  /** Coarser split above `group`, for modules whose dashboard page is divided
   * into tabs. Groups sharing a section become subsections of one tab, in
   * declaration order. Omit and the module renders as a single section. */
  section?: string;
  /** OBJECT_ARRAY only: the per-entry subfields (key = property name). */
  subfields?: ConfigField[];
  /** STRING only: semantic hint for a richer widget. `"color"` renders a swatch
   * picker, `"template"` the placeholder composer with a live preview, and
   * `"multiline"` a plain textarea. */
  format?: string;
  /** `format: "template"` only: the placeholders this field actually supports,
   * offered as insert chips. Declared per field because the set is owned by
   * whichever module renders the string — welcome's differ from tempvc's. */
  templateVars?: string[];
  /** `format: "template"` only: keys of sibling fields that combine with this
   * template into one rendered card (accent color, footer, image gallery,
   * action buttons), so the dashboard's live preview can show the whole card
   * instead of just the raw text. Omit any the module doesn't have. */
  richPreview?: {
    accentColorKey?: string;
    footerKey?: string;
    imageUrlsKey?: string;
    buttonsKey?: string;
    thumbnailKey?: string;
  };
  /** BOOLEAN only: key of the field that says where this toggle's output goes,
   * so a toggle and its channel render as one control instead of drifting
   * apart into separate lists. */
  pairedWith?: string;
  /** This field only takes effect while the named BOOLEAN field is true. */
  enabledBy?: string;
}

export interface ConfigSection {
  name: string;
  groups: { name: string | null; fields: ConfigField[] }[];
  fieldCount: number;
}

/**
 * Splits a module's fields into the sections and subsections its schema
 * declares, preserving declaration order. No surface names a section itself —
 * everything comes from `section`/`group` in the module's own `configSchema`,
 * so adding a field in core is enough to make it appear in both the dashboard
 * and the Discord panel.
 *
 * Fields with no `section` collapse into a single unnamed section, which is how
 * every module that hasn't opted into a divided page renders.
 */
export function sectionsOf(fields: ConfigField[]): ConfigSection[] {
  const order: string[] = [];
  const bySection = new Map<string, ConfigField[]>();

  for (const field of fields) {
    const name = field.section ?? "";
    if (!bySection.has(name)) {
      bySection.set(name, []);
      order.push(name);
    }
    bySection.get(name)!.push(field);
  }

  return order.map((name) => {
    const sectionFields = bySection.get(name)!;
    const groupOrder: (string | null)[] = [];
    const byGroup = new Map<string | null, ConfigField[]>();

    for (const field of sectionFields) {
      const group = field.group ?? null;
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        groupOrder.push(group);
      }
      byGroup.get(group)!.push(field);
    }

    return {
      name,
      groups: groupOrder.map((group) => ({
        name: group,
        fields: byGroup.get(group)!,
      })),
      fieldCount: sectionFields.length,
    };
  });
}
