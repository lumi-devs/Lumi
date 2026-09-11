import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { Time } from "@sapphire/time-utilities";
import { ButtonStyle } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import type { LumiT } from "#lib/i18n/index.js";
import { createActionButton, buildSafeActionRows } from "#lib/utilities/panels.js";
import {
  resolveCardColor,
  makeCard,
  makeInfoCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import {
  buildCaptchaRows,
  sequenceDisplay,
  type CaptchaState,
} from "./captcha.js";

export const VerifyButtonId = "sec:verify";

/** Guild-authored overrides for the panel's copy, from the dashboard's Panel Content fields. */
export interface VerifyPanelContent {
  title?: string | null;
  welcome?: string | null;
  footer?: string | null;
}

/** The public, persistent verification card members interact with to gain the verified role. */
export function buildVerifyPanel(t: LumiT, content?: VerifyPanelContent): CardReply {
  const button = createActionButton({
    customId: VerifyButtonId,
    label: t(PanelsKeys.VerifyButton),
    style: ButtonStyle.Success,
    emoji: Emojis.parse("✅"),
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return makeCard(
    resolveCardColor("success"),
    content?.title || t(PanelsKeys.VerifyTitle),
    content?.welcome || t(PanelsKeys.VerifyIntro),
    {
      footer: content?.footer || t(PanelsKeys.VerifyFooter),
      actionRows: buildSafeActionRows([row]),
    },
  );
}

/** The fresh challenge shown when a member first clicks Verify. */
export function buildChallengeCard(t: LumiT, state: CaptchaState): CardReply {
  const minutes = Math.max(1, Math.round((state.expiresAt - Date.now()) / Time.Minute));
  return makeInfoCard(
    t(PanelsKeys.VerifyChallengeTitle),
    t(PanelsKeys.VerifyChallenge, {
      sequence: sequenceDisplay(state.sequence),
      attempts: state.attempts,
      minutes,
    }),
    { actionRows: buildCaptchaRows(state.buttons, new Set()) },
  );
}

/** After a correct-but-incomplete click: green solved buttons, progress copy. */
export function buildProgressCard(t: LumiT, state: CaptchaState): CardReply {
  const solved = new Set(state.sequence.slice(0, state.progress));
  return makeInfoCard(
    t(PanelsKeys.VerifyProgressTitle, {
      done: state.progress,
      total: state.sequence.length,
    }),
    t(PanelsKeys.VerifyProgress, { sequence: sequenceDisplay(state.sequence) }),
    { actionRows: buildCaptchaRows(state.buttons, solved) },
  );
}

/** After a wrong click with attempts remaining: reset to a clean board. */
export function buildWrongCard(t: LumiT, state: CaptchaState): CardReply {
  return makeWarningCard(
    t(PanelsKeys.VerifyWrongTitle),
    t(PanelsKeys.VerifyWrong, {
      sequence: sequenceDisplay(state.sequence),
      attempts: state.attempts,
    }),
    { actionRows: buildCaptchaRows(state.buttons, new Set()) },
  );
}

/** "web" mode: deep-links to the dashboard's `/verify/[guildId]` page instead of a challenge. */
export function buildWebPromptCard(t: LumiT, url: string): CardReply {
  const button = createActionButton({
    style: ButtonStyle.Link,
    url: url,
    label: t(PanelsKeys.VerifyWebButton),
    emoji: Emojis.parse("🔗"),
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return makeInfoCard(t(PanelsKeys.VerifyWebTitle), t(PanelsKeys.VerifyWebIntro), {
    actionRows: buildSafeActionRows([row]),
  });
}
