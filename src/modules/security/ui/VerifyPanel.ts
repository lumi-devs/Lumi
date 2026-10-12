import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { Time } from "#src/shared/Index.ts";
import { ButtonStyle } from "discord.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { createActionButton, buildSafeActionRows } from "#src/lib/ui/Panels.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import { makeCard, makeInfoCard, makeWarningCard, type CardReply } from "#src/lib/ui/Cards.js";
import {
  buildCaptchaRows,
  sequenceDisplay,
  type CaptchaState,
} from "#src/modules/security/services/Captcha.js";

export const VerifyButtonId = "sec:verify";

export interface VerifyPanelContent {
  title?: string | null;
  welcome?: string | null;
  footer?: string | null;
}

export function buildVerifyPanel(t: LumiT, content?: VerifyPanelContent): CardReply {
  const button = createActionButton({
    customId: VerifyButtonId,
    label: t("panels:verifyButton"),
    style: ButtonStyle.Success,
    emoji: "✅",
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return makeCard(
    resolveCardColor("success"),
    content?.title || t("panels:verifyTitle"),
    content?.welcome || t("panels:verifyIntro"),
    {
      footer: content?.footer || t("panels:verifyFooter"),
      actionRows: buildSafeActionRows([row]),
    },
  );
}

export function buildChallengeCard(t: LumiT, state: CaptchaState): CardReply {
  const minutes = Math.max(1, Math.round((state.expiresAt - Date.now()) / Time.Minute));
  return makeInfoCard(
    t("panels:verifyChallengeTitle"),
    t("panels:verifyChallenge", {
      sequence: sequenceDisplay(state.sequence),
      attempts: state.attempts,
      minutes,
    }),
    { actionRows: buildCaptchaRows(state.buttons, new Set()) },
  );
}

export function buildProgressCard(t: LumiT, state: CaptchaState): CardReply {
  const solved = new Set(state.sequence.slice(0, state.progress));
  return makeInfoCard(
    t("panels:verifyProgressTitle", {
      done: state.progress,
      total: state.sequence.length,
    }),
    t("panels:verifyProgress", { sequence: sequenceDisplay(state.sequence) }),
    { actionRows: buildCaptchaRows(state.buttons, solved) },
  );
}

export function buildWrongCard(t: LumiT, state: CaptchaState): CardReply {
  return makeWarningCard(
    t("panels:verifyWrongTitle"),
    t("panels:verifyWrong", {
      sequence: sequenceDisplay(state.sequence),
      attempts: state.attempts,
    }),
    { actionRows: buildCaptchaRows(state.buttons, new Set()) },
  );
}

export function buildWebPromptCard(t: LumiT, url: string): CardReply {
  const button = createActionButton({
    style: ButtonStyle.Link,
    url: url,
    label: t("panels:verifyWebButton"),
    emoji: "🔗",
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return makeInfoCard(t("panels:verifyWebTitle"), t("panels:verifyWebIntro"), {
    actionRows: buildSafeActionRows([row]),
  });
}
