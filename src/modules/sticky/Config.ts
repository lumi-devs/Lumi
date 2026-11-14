import type { MessageDocumentV2 } from "@contracts/Index.ts";

export interface StickyEntry {
  channel_id: string;
  message: string;
  enabled: boolean;
  accentColor?: string;
  imageUrls?: string[];
  thumbnailUrl?: string;
  richContent?: MessageDocumentV2;
}
