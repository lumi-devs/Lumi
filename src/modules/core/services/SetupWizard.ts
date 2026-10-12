import { authorize } from "#src/lib/api/permissions/Authorize.js";
import type { Container } from "#src/lib/Services.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { UserError } from "#src/shared/Index.ts";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

export interface SetupWizardState {
  logChannelId: string | null;
  verificationMode: string | null;
  joinGateEnabled: boolean | null;
  minAgeHours: number | null;
}

const SetupNullToken = "skip";
const SetupUnsetToken = "x";
export const VerificationModes = ["emoji", "none", "web"] as const;
const DefaultMinAgeHours = 24;
const MaxAccountAgeHours = 8760;

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

export async function hasSetupAccess(interaction: SetupInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  return authorize(
    { userId: interaction.user.id, guildId: interaction.guild.id, memberPermissions: interaction.memberPermissions },
    { kind: "guildManager" },
  );
}

export const setupAccessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `❌ You need the Manage Server permission to run setup.`,
  });

export async function finishSetupWizard(
  services: Container,
  guildId: string,
  state: SetupWizardState,
  actorId: string,
): Promise<void> {
  const cfg = getUtility("config");
  const writes: Array<[string, unknown]> = [];
  if (state.logChannelId) writes.push(["log_channel_id", state.logChannelId]);
  if (state.verificationMode) writes.push(["verification_mode", state.verificationMode]);
  if (state.joinGateEnabled !== null) writes.push(["joingate_enabled", state.joinGateEnabled]);
  if (state.joinGateEnabled === true && state.minAgeHours !== null) {
    writes.push(["min_account_age_hours", state.minAgeHours]);
  }
  for (const [key, value] of writes) {
    await cfg.setConfig(services, guildId, "security", key, value, actorId);
  }
}
