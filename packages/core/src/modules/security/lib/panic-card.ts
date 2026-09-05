import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { createActionButton, buildSafeActionRows } from "#lib/utilities/panels.js";
import {
  resolveCardColor,
  makeCard,
  makeSuccessCard,
  type CardReply,
} from "#lib/utilities/cards.js";

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
    t(PanelsKeys.PanicCancelledTitle),
    t(PanelsKeys.PanicCancelledBody),
  );
}

/** Status card shown after activation, with a one-button revert. */
export function buildPanicStatusCard(
  t: LumiT,
  status: { invitesPaused: boolean; lockedCount: number; skippedCount: number },
): CardReply {
  return makeCard(
    resolveCardColor("error"),
    t(PanelsKeys.PanicActiveTitle),
    t(PanelsKeys.PanicActiveBody, {
      locked: status.lockedCount,
      skipped:
        status.skippedCount > 0 ? `, skipped ${status.skippedCount}` : "",
      invites: status.invitesPaused
        ? t(PanelsKeys.PanicInvitesPaused)
        : t(PanelsKeys.PanicInvitesFailed),
    }),
    { actionRows: buildSafeActionRows([revertRow(t(PanelsKeys.PanicRevertButton))]) },
  );
}

/** Recovery view when `/panic` is re-run while already active. */
export function buildPanicAlreadyActiveCard(
  t: LumiT,
  startedAt: Date,
): CardReply {
  return makeCard(
    resolveCardColor("error"),
    t(PanelsKeys.PanicAlreadyActiveTitle),
    t(PanelsKeys.PanicAlreadyActiveBody, {
      since: time(startedAt, TimestampStyles.RelativeTime),
    }),
    { actionRows: buildSafeActionRows([revertRow(t(PanelsKeys.PanicRevertButton))]) },
  );
}

export function buildPanicRevertedCard(
  t: LumiT,
  restoredCount: number,
): CardReply {
  return makeSuccessCard(
    t(PanelsKeys.PanicRevertedTitle),
    t(PanelsKeys.PanicReverted, { restored: restoredCount }),
  );
}
