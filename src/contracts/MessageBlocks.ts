export type MessageBlockButtonStyle =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "link";

export interface MessageBlockButton {
  style: MessageBlockButtonStyle;
  label: string;
  emoji?: string;

  customId?: string;

  url?: string;
}

export type SectionAccessory =
  | { type: "thumbnail"; url: string }
  | { type: "button"; button: MessageBlockButton };

export interface SectionBlock {
  id: string;
  type: "section";

  texts: string[];
  accessory?: SectionAccessory;
}

export interface MediaGalleryBlock {
  id: string;
  type: "mediaGallery";

  imageUrls: string[];
}

export interface SeparatorBlock {
  id: string;
  type: "separator";
  size: "small" | "large";
  divider: boolean;
}

export interface ActionRowBlock {
  id: string;
  type: "actionRow";

  buttons: MessageBlockButton[];
}

export type MessageBlockV2 =
  | SectionBlock
  | MediaGalleryBlock
  | SeparatorBlock
  | ActionRowBlock;

export interface MessageDocumentV2 {

  accentColor?: string;
  blocks: MessageBlockV2[];
}

export const EmptyMessageDocumentV2: MessageDocumentV2 = { blocks: [] };

export const MessageBlockLimits = {
  maxTextsPerSection: 3,
  maxButtonsPerActionRow: 5,
  maxActionRows: 5,
  maxImagesPerGallery: 10,

  maxTotalComponents: 40,
} as const;

export function countComponents(doc: MessageDocumentV2): number {
  let count = 1;
  for (const block of doc.blocks) {
    switch (block.type) {
      case "section":
        count += 1 + block.texts.length + (block.accessory ? 1 : 0);
        break;
      case "mediaGallery":
        count += 1 + block.imageUrls.length;
        break;
      case "separator":
        count += 1;
        break;
      case "actionRow":
        count += 1 + block.buttons.length;
        break;
    }
  }
  return count;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function clampButton(raw: unknown): MessageBlockButton | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const style: MessageBlockButtonStyle =
    r.style === "primary" ||
    r.style === "secondary" ||
    r.style === "success" ||
    r.style === "danger" ||
    r.style === "link"
      ? r.style
      : "secondary";
  const label = typeof r.label === "string" ? r.label.slice(0, 80) : "";
  if (label.length === 0) return null;
  const emoji = typeof r.emoji === "string" && r.emoji.length > 0 ? r.emoji.slice(0, 100) : undefined;
  if (style === "link") {
    const url = typeof r.url === "string" ? r.url : "";
    if (url.length === 0) return null;
    return { style, label, emoji, url };
  }
  const customId = typeof r.customId === "string" ? r.customId.slice(0, 100) : undefined;
  return { style, label, emoji, customId };
}

function clampAccessory(raw: unknown): SectionAccessory | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.type === "thumbnail") {
    const url = typeof r.url === "string" ? r.url : "";
    return url.length > 0 ? { type: "thumbnail", url } : undefined;
  }
  if (r.type === "button") {
    const button = clampButton(r.button);
    return button ? { type: "button", button } : undefined;
  }
  return undefined;
}

function clampBlock(raw: unknown): MessageBlockV2 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.length > 0 ? r.id : crypto.randomUUID();
  switch (r.type) {
    case "section": {
      const texts = Array.isArray(r.texts)
        ? r.texts.filter((t): t is string => typeof t === "string").slice(0, MessageBlockLimits.maxTextsPerSection)
        : [];
      if (texts.length === 0) return null;
      const accessory = clampAccessory(r.accessory);
      return { id, type: "section", texts, ...(accessory ? { accessory } : {}) };
    }
    case "mediaGallery": {
      const imageUrls = Array.isArray(r.imageUrls)
        ? r.imageUrls
            .filter((u): u is string => typeof u === "string" && u.length > 0)
            .slice(0, MessageBlockLimits.maxImagesPerGallery)
        : [];
      if (imageUrls.length === 0) return null;
      return { id, type: "mediaGallery", imageUrls };
    }
    case "separator": {
      const size = r.size === "large" ? "large" : "small";
      const divider = r.divider !== false;
      return { id, type: "separator", size, divider };
    }
    case "actionRow": {
      const buttons = Array.isArray(r.buttons)
        ? r.buttons
            .map(clampButton)
            .filter((b): b is MessageBlockButton => b !== null)
            .slice(0, MessageBlockLimits.maxButtonsPerActionRow)
        : [];
      if (buttons.length === 0) return null;
      return { id, type: "actionRow", buttons };
    }
    default:
      return null;
  }
}

export function clampMessageDocumentV2(raw: unknown): MessageDocumentV2 {
  if (typeof raw !== "object" || raw === null) return { blocks: [] };
  const r = raw as Record<string, unknown>;
  const accentColor = isHexColor(r.accentColor) ? r.accentColor : undefined;
  const rawBlocks = Array.isArray(r.blocks) ? r.blocks : [];

  const blocks: MessageBlockV2[] = [];
  let actionRowCount = 0;
  for (const rawBlock of rawBlocks) {
    const block = clampBlock(rawBlock);
    if (!block) continue;
    if (block.type === "actionRow") {
      if (actionRowCount >= MessageBlockLimits.maxActionRows) continue;
      actionRowCount++;
    }
    blocks.push(block);
    if (countComponents({ blocks, accentColor }) > MessageBlockLimits.maxTotalComponents) {
      blocks.pop();
      break;
    }
  }

  return accentColor ? { accentColor, blocks } : { blocks };
}
