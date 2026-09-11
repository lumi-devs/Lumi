import {
  Module,
  DefineModule,
  NoEndUserData,
  cfg,
} from "#lib/module-system/Module.js";
import type { MessageDocumentV2 } from "@lumi/contracts";

export interface StickyEntry {
  channel_id: string;
  message: string;
  enabled: boolean;
  accentColor?: string;
  imageUrls?: string[];
  thumbnailUrl?: string;
  richContent?: MessageDocumentV2;
}

@DefineModule({
  name: "sticky",
  displayName: "Sticky Messages",
  emoji: "📌",
  description:
    "Re-posts a configured message to the bottom of a channel every time a new message is sent there.",
  short: "Keep a message pinned to the bottom of a channel.",
  endUserDataStatement: NoEndUserData(),
  category: "Community",
  configSchema: cfg.object({
    entries: cfg.objectArray(
      {
        channel_id: cfg.channel({
          label: "Channel",
          description: "Channel the sticky message is re-posted in.",
        }),
        message: cfg.string({
          label: "Message",
          description:
            "Plain-text message re-posted after every new message in the channel.",
          format: "multiline",
        }),
        enabled: cfg.boolean({
          label: "Enabled",
          description: "Whether this sticky entry is active.",
          default: true,
        }),
        accentColor: cfg.string({
          label: "Accent Color",
          description:
            "Card accent bar as hex (e.g. #5865F2). Empty uses the default.",
          format: "color",
        }),
        imageUrls: cfg.stringList({
          label: "Images",
          description: "Image URLs shown as a gallery (max 10).",
          default: [],
        }),
        thumbnailUrl: cfg.string({
          label: "Thumbnail",
          description: "Small image shown beside the message text. Image URL.",
          format: "image",
        }),
        richContent: cfg.componentsV2Blocks({
          label: "Advanced Layout",
          description:
            "Optional block-based layout (Section, Media Gallery, Separator, Action Row) for this sticky message. When it has any blocks, it replaces the plain message text above.",
        }),
      },
      {
        group: "Stickies",
        label: "Sticky Entries",
        description: "One entry per channel. The old sticky post is deleted before the new one goes up.",
        default: [],
      },
    ),
  }),
})
export class StickyModule extends Module {}
