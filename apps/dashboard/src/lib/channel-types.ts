// Duplicates discord.js `ChannelType` values so the dashboard bundle doesn't
// have to import discord.js.

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
