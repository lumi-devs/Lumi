import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { LumiT } from "#lib/i18n/index.js";
import { createActionButton, buildSafeActionRows } from "#lib/ui/panels.js";
import { resolveCardColor } from "#lib/utilities/config.js";
import { makeCard, makeSuccessCard, type CardReply } from "#lib/ui/cards.js";

export const PanicRevertId = "sec:panic:revert";

const revertRow = (label: string): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    createActionButton({
      customId: PanicRevertId,
      label,
      style: ButtonStyle.Success,
    })
  );

export function buildPanicCancelledCard(t: LumiT): CardReply {
  return makeCard(
    resolveCardColor("info"),
    t("panels:panicCancelledTitle"),
    t("panels:panicCancelledBody"),
  );
}

/** Status card shown after activation, with a one-button revert. */
export function buildPanicStatusCard(
  t: LumiT,
  status: { invitesPaused: boolean; lockedCount: number; skippedCount: number },
): CardReply {
  return makeCard(
    resolveCardColor("error"),
    t("panels:panicActiveTitle"),
    t("panels:panicActiveBody", {
      locked: status.lockedCount,
      skipped:
        status.skippedCount > 0 ? `, skipped ${status.skippedCount}` : "",
      invites: status.invitesPaused
        ? t("panels:panicInvitesPaused")
        : t("panels:panicInvitesFailed"),
    }),
    { actionRows: buildSafeActionRows([revertRow(t("panels:panicRevertButton"))]) },
  );
}

/** Recovery view when `/panic` is re-run while already active. */
export function buildPanicAlreadyActiveCard(
  t: LumiT,
  startedAt: Date,
): CardReply {
  return makeCard(
    resolveCardColor("error"),
    t("panels:panicAlreadyActiveTitle"),
    t("panels:panicAlreadyActiveBody", {
      since: time(startedAt, TimestampStyles.RelativeTime),
    }),
    { actionRows: buildSafeActionRows([revertRow(t("panels:panicRevertButton"))]) },
  );
}

export function buildPanicRevertedCard(
  t: LumiT,
  restoredCount: number,
): CardReply {
  return makeSuccessCard(
    t("panels:panicRevertedTitle"),
    t("panels:panicReverted", { restored: restoredCount }),
  );
}
