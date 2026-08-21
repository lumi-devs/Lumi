// Duplicates discord.js `ChannelType` values instead of importing discord.js:
// confirmed by an actual build attempt that Next.js/Turbopack can't resolve
// discord.js's `@discordjs/ws` -> `zlib-sync` lazy-import chain even in a
// server component, so this isn't just a client-bundle-size guard - the
// import breaks the build outright.

const TEXT = 0;
const VOICE = 2;
const ANNOUNCEMENT = 5;
const STAGE = 13;

export function isTextChannel(type: number): boolean {
  return type === TEXT || type === ANNOUNCEMENT;
}

export function isVoiceChannel(type: number): boolean {
  return type === VOICE || type === STAGE;
}

export function isCommandChannel(type: number): boolean {
  return isTextChannel(type) || isVoiceChannel(type);
}
