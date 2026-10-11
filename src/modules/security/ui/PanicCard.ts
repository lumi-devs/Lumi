import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { createActionButton, buildSafeActionRows } from "#src/lib/ui/Panels.js";
import { resolveCardColor } from "#src/lib/ui/Palette.js";
import { makeCard, makeSuccessCard, type CardReply } from "#src/lib/ui/Cards.js";

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
