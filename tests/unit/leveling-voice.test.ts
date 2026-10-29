import type { VoiceState } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  isAudible,
  voiceAudibleTransition,
} from "../../modules/community/leveling/voice-sessions.ts";

interface StateOptions {
  muted?: boolean;
  deafened?: boolean;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  suppressed?: boolean;
  bot?: boolean;
  channelId?: string | null;
  voiceBased?: boolean;
  others?: number;
}

function makeState(options: StateOptions = {}): VoiceState {
  const members = new Map<string, { user: { bot: boolean } }>();
  members.set("self", { user: { bot: options.bot ?? false } });
  for (let i = 0; i < (options.others ?? 1); i++) {
    members.set(`other-${i}`, { user: { bot: false } });
  }

  return {
    channelId: options.channelId === undefined ? "voice-1" : options.channelId,
    mute: options.muted ?? false,
    deaf: options.deafened ?? false,
    selfMute: options.selfMuted ?? false,
    selfDeaf: options.selfDeafened ?? false,
    suppress: options.suppressed ?? false,
    member: { user: { bot: options.bot ?? false } },
    channel: {
      isVoiceBased: () => options.voiceBased ?? true,
      members,
    },
  } as unknown as VoiceState;
}

describe("isAudible", () => {
  it("accepts an unmuted, undeafened member sharing a voice channel", () => {
    expect(isAudible(makeState())).toBe(true);
  });

  const rejected: Array<[string, StateOptions]> = [
    ["server muted", { muted: true }],
    ["server deafened", { deafened: true }],
    ["self muted", { selfMuted: true }],
    ["self deafened", { selfDeafened: true }],
    ["suppressed", { suppressed: true }],
    ["a bot", { bot: true }],
    ["alone in the channel", { others: 0 }],
    ["not in a voice channel", { channelId: null }],
    ["in a non-voice channel", { voiceBased: false }],
  ];

  it.each(rejected)("rejects a member that is %s", (_label, options) => {
    expect(isAudible(makeState(options))).toBe(false);
  });
});

describe("voiceAudibleTransition", () => {
  it("starts a session on unmute and excludes time spent muted afterwards", () => {
    const guildId = "transition-guild";
    const userId = "member";

    expect(voiceAudibleTransition(guildId, userId, false, true, 1_000)).toBeNull();
    expect(voiceAudibleTransition(guildId, userId, true, false, 61_000)).toBe(60_000);
  });

  it("starts a fresh session after unmuting again", () => {
    const guildId = "resume-guild";
    const userId = "member";

    voiceAudibleTransition(guildId, userId, false, true, 1_000);
    expect(voiceAudibleTransition(guildId, userId, true, false, 61_000)).toBe(60_000);

    voiceAudibleTransition(guildId, userId, false, true, 181_000);
    expect(voiceAudibleTransition(guildId, userId, true, false, 241_000)).toBe(60_000);
  });

  it("ignores transitions where audibility does not change", () => {
    const guildId = "unchanged-guild";
    const userId = "member";

    expect(voiceAudibleTransition(guildId, userId, false, false, 1_000)).toBeNull();
    expect(voiceAudibleTransition(guildId, userId, true, true, 2_000)).toBeNull();
  });
});
