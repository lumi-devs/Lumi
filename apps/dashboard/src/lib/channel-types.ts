// Duplicates discord.js `ChannelType` values instead of importing discord.js:
// confirmed by an actual build attempt that Next.js/Turbopack can't resolve
// discord.js's `@discordjs/ws` -> `zlib-sync` lazy-import chain even in a
// server component, so this isn't just a client-bundle-size guard - the
// import breaks the build outright.

const ChannelTypeText = 0;
const ChannelTypeVoice = 2;
const ChannelTypeAnnouncement = 5;
const ChannelTypeStage = 13;

export function isTextChannel(type: number): boolean {
  return type === ChannelTypeText || type === ChannelTypeAnnouncement;
}

export function isVoiceChannel(type: number): boolean {
  return type === ChannelTypeVoice || type === ChannelTypeStage;
}

export function isCommandChannel(type: number): boolean {
  return isTextChannel(type) || isVoiceChannel(type);
}
