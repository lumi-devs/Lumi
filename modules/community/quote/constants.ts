export const QuoteModuleName = "community-quote";
export const QuoteConfigKey = "quote";
export const QuoteRequirement = "makeitaquote@^12.1.6";
export const QuoteAttachmentName = "quote.png";
export const QuoteDefaultWatermark = "Make it a Quote";

export const QuoteThemes = ["dark", "color"] as const;

export const QuoteNameSources = ["nickname", "global"] as const;
export type QuoteNameSource = (typeof QuoteNameSources)[number];

export const QuoteAvatarSources = ["guild", "global"] as const;
export type QuoteAvatarSource = (typeof QuoteAvatarSources)[number];
