import { row, type Row } from "#modules/core/ui/common.js";
import {
  ageButtonCustomId,
  ageModalCustomId,
  finishCustomId,
  normalizeSetupState,
  stepCustomId,
  type SetupWizardState,
} from "#modules/core/lib/setup-wizard.js";
import { Emojis } from "#utilities/assets.js";
import {
  makeCard,
  makeSuccessCard,
  resolveCardColor,
  type CardReply,
} from "#utilities/cards.js";
import {
  buildSafeActionRows,
  createActionButton,
  createChannelSelectMenu,
  createStringSelectMenu,
} from "#utilities/panels.js";
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { ButtonStyle, ChannelType, TextInputStyle } from "discord.js";

export const SetupTotalSteps = 4;

const verificationLabels: Record<string, string> = {
  emoji: "Emoji captcha",
  none: "One-click",
  web: "Web challenge",
};

const verificationDescriptions: Record<string, string> = {
  emoji: "Members solve an emoji sequence (recommended)",
  none: "Single button press, no challenge",
  web: "Members verify through a dashboard challenge",
};

export function setupProgressLines(
  current: number,
  state: SetupWizardState,
): string[] {
  const logLine = state.logChannelId
    ? `✓ Log channel — <#${state.logChannelId}>`
    : current > 1
      ? "✓ Log channel — skipped"
      : "· Log channel — pending";
  const modeLine = state.verificationMode
    ? `✓ Verification — ${verificationLabels[state.verificationMode] ?? state.verificationMode}`
    : "· Verification — pending";
  const gateLine =
    state.joinGateEnabled === null
      ? "· Join gate — pending"
      : state.joinGateEnabled
        ? `✓ Join gate — on${state.minAgeHours !== null ? `, min age ${state.minAgeHours}h` : ""}`
        : "✓ Join gate — off";
  const reviewLine =
    current >= SetupTotalSteps ? "· Review & finish" : "· Review & finish";
  return [logLine, modeLine, gateLine, reviewLine];
}

function setupShell(
  step: number,
  heading: string,
  state: SetupWizardState,
  hint: string,
  rows: Row[],
): CardReply {
  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.Shield} Server Setup — Step ${step} of ${SetupTotalSteps}`,
    [setupProgressLines(step, state).join("\n"), `**${heading}**\n${hint}`],
    {
      breadcrumbs: ["Setup"],
      footer: "Ephemeral setup — only you can see this.",
      actionRows: buildSafeActionRows(rows),
      separatorAboveActionRows: true,
    },
  );
}

export function buildSetupStepView(
  step: 1 | 2 | 3,
  state: SetupWizardState,
): CardReply {
  if (step === 1) {
    return setupShell(1, "Log channel", state, "Pick where security alerts go.", [
      row(
        createChannelSelectMenu({
          customId: "setup:step:1:ch",
          placeholder: "Select a log channel…",
          channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
          minValues: 0,
          maxValues: 1,
        }),
      ),
      row(
        createActionButton({
          customId: stepCustomId(2, state),
          label: "Skip",
          style: ButtonStyle.Secondary,
        }),
      ),
    ]);
  }

  if (step === 2) {
    return setupShell(
      2,
      "Verification level",
      state,
      "How should new members prove they are human?",
      [
        row(
          createStringSelectMenu({
            customId: ["setup", "step", "2", ...logOnly(state), "vmode"].join(
              ":",
            ),
            placeholder: "Select a verification level…",
            options: Object.keys(verificationLabels).map(
              (mode) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(verificationLabels[mode]!)
                  .setValue(mode)
                  .setDescription(verificationDescriptions[mode]!)
                  .setDefault(state.verificationMode === mode),
            ),
          }),
        ),
        row(
          createActionButton({
            customId: stepCustomId(1, state),
            label: "Back",
            style: ButtonStyle.Secondary,
          }),
        ),
      ],
    );
  }

  const gateOn = state.joinGateEnabled === true;
  const gateOff = state.joinGateEnabled === false;
  return setupShell(
    3,
    "Join gate",
    state,
    "Screen new members for raids and throwaway accounts.",
    [
      row(
        createActionButton({
          customId: stepCustomId(3, { ...state, joinGateEnabled: true }),
          label: gateOn ? "On ✓" : "On",
          style: gateOn ? ButtonStyle.Success : ButtonStyle.Secondary,
        }),
        createActionButton({
          customId: stepCustomId(3, { ...state, joinGateEnabled: false }),
          label: gateOff ? "Off ✓" : "Off",
          style: gateOff ? ButtonStyle.Primary : ButtonStyle.Secondary,
        }),
      ),
      row(
        createActionButton({
          customId: ageButtonCustomId(state),
          label:
            state.minAgeHours !== null
              ? `Min age: ${state.minAgeHours}h`
              : "Set min age…",
          emoji: Emojis.Edit,
          style: ButtonStyle.Secondary,
        }),
        createActionButton({
          customId: stepCustomId(2, state),
          label: "Back",
          style: ButtonStyle.Secondary,
        }),
        createActionButton({
          customId: stepCustomId(4, normalizeSetupState(state)),
          label: "Continue",
          style: ButtonStyle.Primary,
        }),
      ),
    ],
  );
}

function logOnly(state: SetupWizardState): string[] {
  return ["log", state.logChannelId ?? "skip"];
}

export function buildSetupReviewView(state: SetupWizardState): CardReply {
  const settled = normalizeSetupState(state);
  const summary = [
    `Log channel: ${settled.logChannelId ? `<#${settled.logChannelId}>` : "Skipped"}`,
    `Verification: ${settled.verificationMode ? (verificationLabels[settled.verificationMode] ?? settled.verificationMode) : "Unchanged"}`,
    `Join gate: ${settled.joinGateEnabled ? `On — accounts under ${settled.minAgeHours}h are gated` : "Off"}`,
  ].join("\n");
  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.Shield} Server Setup — Review`,
    [setupProgressLines(SetupTotalSteps, settled).join("\n"), summary],
    {
      breadcrumbs: ["Setup", "Review"],
      footer: "Finish writes these values to the security module.",
      actionRows: buildSafeActionRows([
        row(
          createActionButton({
            customId: stepCustomId(3, state),
            label: "Back",
            style: ButtonStyle.Secondary,
          }),
          createActionButton({
            customId: finishCustomId(settled),
            label: "Finish",
            style: ButtonStyle.Success,
          }),
        ),
      ]),
      separatorAboveActionRows: true,
    },
  );
}

export function buildSetupSuccessCard(state: SetupWizardState): CardReply {
  const settled = normalizeSetupState(state);
  const recap = [
    `Log channel: ${settled.logChannelId ? `<#${settled.logChannelId}>` : "Skipped"}`,
    `Verification: ${settled.verificationMode ? (verificationLabels[settled.verificationMode] ?? settled.verificationMode) : "Unchanged"}`,
    `Join gate: ${settled.joinGateEnabled ? `On (min age ${settled.minAgeHours}h)` : "Off"}`,
  ].join("\n");
  return makeSuccessCard(`${Emojis.Check} Setup Complete`, recap, {
    breadcrumbs: ["Setup"],
    footer: "Open the Hub to fine-tune every module.",
    actionRows: buildSafeActionRows([
      row(
        createActionButton({
          customId: "lumi:tab:home",
          label: "Open Hub",
          emoji: Emojis.Bot,
          style: ButtonStyle.Primary,
        }),
      ),
    ]),
    separatorAboveActionRows: true,
  });
}

export function buildSetupAgeModal(state: SetupWizardState): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId("minAgeHours")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("e.g. 24 (0 disables the check)");
  if (state.minAgeHours !== null) {
    input.setValue(String(state.minAgeHours));
  }
  const label = new LabelBuilder()
    .setLabel("Min account age (hours)")
    .setDescription("Accounts younger than this are gated. Max 8760.")
    .setTextInputComponent(input);
  return new ModalBuilder()
    .setCustomId(ageModalCustomId(state))
    .setTitle("Join Gate Min Age")
    .addLabelComponents(label);
}
