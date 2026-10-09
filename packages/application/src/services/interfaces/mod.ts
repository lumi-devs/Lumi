import type { Guild, User } from "discord.js";
import type { WarnThresholdAction } from "@lumi/contracts/rpc";

export interface BanApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
  deleteMessageSeconds?: number;
}

export interface BanUndoOptions {
  guild: Guild;
  targetId: string;
  moderator: User;
  reason: string;
}

export interface KickApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
}

export interface MuteApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
  durationSeconds?: number;
}

export interface MuteUndoOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
}

export interface SoftbanApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
  deleteMessageSeconds?: number;
}

export interface VoiceMuteApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
}

export interface VoiceMuteUndoOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
}

export interface WarnApplyOptions {
  guild: Guild;
  targetUser: User;
  moderator: User;
  reason: string;
}

export type ThresholdAction = WarnThresholdAction;

export interface ThresholdEntry {
  action: ThresholdAction;
  duration?: number;
}

export type WarnThresholds = Record<string, ThresholdEntry>;
