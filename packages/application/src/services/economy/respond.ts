import type { CommandContext } from "@lumi/lib/commands/context.js";
import { formatDuration } from "@lumi/lib/utilities/time.js";
import {
  CooldownError,
  EconomyError,
} from "./BankService.js";

export async function reportEconomyError(
  ctx: CommandContext,
  err: unknown,
): Promise<void> {
  if (err instanceof CooldownError) {
    await ctx.replyError(
      "On cooldown",
      `${err.message} Try again in ${formatDuration(Math.max(1000, err.retryAfterMs))}.`,
    );
    return;
  }
  if (err instanceof EconomyError) {
    await ctx.replyError("Economy", err.message);
    return;
  }
  throw err;
}
