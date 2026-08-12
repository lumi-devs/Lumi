import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import {
  resolveCardColor,
  makeCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { confirmRow } from "#lib/utilities/ui/kit.js";

export const PANIC_CONFIRM_ID = "sec:panic:confirm";
export const PANIC_CANCEL_ID = "sec:panic:cancel";
export const PANIC_REVERT_ID = "sec:panic:revert";

const revertRow = (label: string): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PANIC_REVERT_ID)
      .setLabel(label)
      .setStyle(ButtonStyle.Success),
  );

/** The confirm/cancel prompt shown before panic mode locks anything down. */
export function buildPanicConfirmCard(t: LumiT): CardReply {
  return makeWarningCard(
    t(PanelsKeys.PanicConfirmTitle),
    t(PanelsKeys.PanicConfirmBody),
    {
      actionRows: [
        confirmRow({
          confirmId: PANIC_CONFIRM_ID,
          cancelId: PANIC_CANCEL_ID,
          confirmLabel: t(PanelsKeys.PanicConfirmButton),
        }),
      ],
    },
  );
}

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
    { actionRows: [revertRow(t(PanelsKeys.PanicRevertButton))] },
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
    { actionRows: [revertRow(t(PanelsKeys.PanicRevertButton))] },
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
