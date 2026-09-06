import { getUtility } from "#lib/module-system/Utility.js";
import { Emojis } from "#utilities/assets.js";
import { UserError } from "@sapphire/framework";
import {
  PermissionFlagsBits,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";

export interface SetupWizardState {
  logChannelId: string | null;
  verificationMode: string | null;
  joinGateEnabled: boolean | null;
  minAgeHours: number | null;
}

export const SetupNullToken = "skip";
export const SetupUnsetToken = "x";
export const VerificationModes = ["emoji", "none", "web"] as const;
export const DefaultMinAgeHours = 24;
export const MaxAccountAgeHours = 8760;

export const emptySetupState = (): SetupWizardState => ({
  logChannelId: null,
  verificationMode: null,
  joinGateEnabled: null,
  minAgeHours: null,
});

export function segmentsFromState(state: SetupWizardState): string[] {
  return [
    "log",
    state.logChannelId ?? SetupNullToken,
    "mode",
    state.verificationMode ?? SetupNullToken,
    "gate",
    state.joinGateEnabled === null
      ? SetupUnsetToken
      : state.joinGateEnabled
        ? "1"
        : "0",
    "age",
    state.minAgeHours === null ? SetupUnsetToken : String(state.minAgeHours),
  ];
}

export function stateFromSegments(segments: string[]): SetupWizardState {
  const state = emptySetupState();
  for (let i = 0; i + 1 < segments.length; i += 2) {
    const key = segments[i];
    const value = segments[i + 1]!;
    if (key === "log" && value !== SetupNullToken && /^\d+$/.test(value)) {
      state.logChannelId = value;
    } else if (
      key === "mode" &&
      (VerificationModes as readonly string[]).includes(value)
    ) {
      state.verificationMode = value;
    } else if (key === "gate" && (value === "1" || value === "0")) {
      state.joinGateEnabled = value === "1";
    } else if (key === "age" && /^\d+$/.test(value)) {
      state.minAgeHours = Number(value);
    }
  }
  return state;
}

export function stepCustomId(step: number, state: SetupWizardState): string {
  return ["setup", "step", String(step), ...segmentsFromState(state)].join(
    ":",
  );
}

export function finishCustomId(state: SetupWizardState): string {
  return ["setup", "finish", ...segmentsFromState(state)].join(":");
}

export function ageButtonCustomId(state: SetupWizardState): string {
  return ["setup", "agebtn", ...segmentsFromState(state)].join(":");
}

export function ageModalCustomId(state: SetupWizardState): string {
  return ["setup", "agemodal", ...segmentsFromState(state)].join(":");
}

export function normalizeSetupState(state: SetupWizardState): SetupWizardState {
  const gate = state.joinGateEnabled ?? false;
  return {
    ...state,
    joinGateEnabled: gate,
    minAgeHours: gate ? (state.minAgeHours ?? DefaultMinAgeHours) : null,
  };
}

export function parseMinAgeHours(
  raw: string | undefined,
): { value?: number; error?: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return { error: "Min age must be a whole number of hours (0-8760)." };
  }
  const value = Number(trimmed);
  if (value > MaxAccountAgeHours) {
    return { error: "Min age cannot exceed 8760 hours." };
  }
  return { value };
}

type SetupInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export function hasSetupAccess(interaction: SetupInteraction): boolean {
  if (!interaction.guild) return false;
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
    false
  );
}

export const setupAccessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.Cross} You need the Manage Server permission to run setup.`,
  });

export async function finishSetupWizard(
  guildId: string,
  state: SetupWizardState,
  actorId: string,
): Promise<void> {
  const cfg = getUtility("config");
  if (state.logChannelId) {
    await cfg.setConfig(
      guildId,
      "security",
      "log_channel_id",
      state.logChannelId,
      actorId,
    );
  }
  if (state.verificationMode) {
    await cfg.setConfig(
      guildId,
      "security",
      "verification_mode",
      state.verificationMode,
      actorId,
    );
  }
  if (state.joinGateEnabled !== null) {
    await cfg.setConfig(
      guildId,
      "security",
      "joingate_enabled",
      state.joinGateEnabled,
      actorId,
    );
  }
  if (state.joinGateEnabled === true && state.minAgeHours !== null) {
    await cfg.setConfig(
      guildId,
      "security",
      "min_account_age_hours",
      state.minAgeHours,
      actorId,
    );
  }
}
