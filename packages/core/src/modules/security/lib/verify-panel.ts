import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  CARD_ACCENTS,
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

export const VERIFY_BUTTON_ID = "sec:verify";

/** The public, persistent verification card members interact with to gain the verified role. */
export function buildVerifyPanel(t: LumiT): CardReply {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel(t(PanelsKeys.VerifyButton))
      .setStyle(ButtonStyle.Success)
      .setEmoji(Emojis.parse("✅")),
  );
  return makeCard(CARD_ACCENTS.SUCCESS, t(PanelsKeys.VerifyTitle), t(PanelsKeys.VerifyIntro), {
    footer: t(PanelsKeys.VerifyFooter),
    actionRows: [row],
  });
}

/** The fresh challenge shown when a member first clicks Verify. */
export function buildChallengeCard(t: LumiT, state: CaptchaState): CardReply {
  const minutes = Math.max(1, Math.round((state.expiresAt - Date.now()) / 60000));
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
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setLabel(t(PanelsKeys.VerifyWebButton))
      .setEmoji(Emojis.parse("🔗")),
  );
  return makeInfoCard(t(PanelsKeys.VerifyWebTitle), t(PanelsKeys.VerifyWebIntro), {
    actionRows: [row],
  });
}
