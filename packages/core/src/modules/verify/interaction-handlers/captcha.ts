import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { tryParseJSON } from "@sapphire/utilities";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
  makeWarningCard,
  ephemeralCard,
} from "#utilities/cards.js";
import { VerifyKeys, EMOJI_POOL, type SeqState } from "../keys.js";

function buildRows(
  guildId: string,
  userId: string,
  buttons: number[],
  disabledCorrect: Set<number>,
): ActionRowBuilder<ButtonBuilder>[] {
  const half = Math.ceil(buttons.length / 2);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < 2; r++) {
    const slice = buttons.slice(r * half, r * half + half);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      slice.map((idx) =>
        new ButtonBuilder()
          .setCustomId(`verify:seq:${guildId}:${userId}:${idx}`)
          .setLabel(EMOJI_POOL[idx]!)
          .setStyle(
            disabledCorrect.has(idx)
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
          )
          .setDisabled(disabledCorrect.has(idx)),
      ),
    );
    rows.push(row);
  }
  return rows;
}

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class CaptchaInteractionHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("verify:seq:")) return this.none();
    return this.some();
  }

  public async run(interaction: ButtonInteraction): Promise<void> {
    // verify:seq:<guildId>:<userId>:<emojiIdx>
    const parts = interaction.customId.split(":");
    const guildId = parts[2] ?? "";
    const userId = parts[3] ?? "";
    const clickedIdx = parseInt(parts[4] ?? "-1", 10);

    if (!guildId || !userId || isNaN(clickedIdx)) return;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        ...ephemeralCard(
          makeErrorCard("Not Yours", "This captcha is not for you."),
        ),
      });
      return;
    }

    const key = VerifyKeys.seqState(guildId, userId);
    const raw = await this.container.redis.get(key);

    const state = raw ? (tryParseJSON(raw) as SeqState | null) : null;
    if (!state) {
      await interaction.update(
        makeErrorCard(
          "Expired",
          "Your verification session expired. Please contact a moderator.",
        ),
      );
      return;
    }

    const expected = state.sequence[state.progress];

    if (clickedIdx === expected) {
      state.progress++;

      if (state.progress === state.sequence.length) {
        // ── All correct — verify the member ──────────────────────────────
        // Pipeline the two cleanup writes — one round-trip.
        await this.container.redis
          .multi()
          .del(key)
          .zrem(VerifyKeys.pendingSet(guildId), userId)
          .exec();

        const guild = this.container.client.guilds.cache.get(guildId);
        const member = await guild?.members.fetch(userId).catch(() => null);

        if (member) {
          const [pendingRoleId, verifiedRoleId] = await Promise.all([
            this.container.db.config.getModuleConfig(
              guildId,
              "verify",
              "pending_role_id",
            ),
            this.container.db.config.getModuleConfig(
              guildId,
              "verify",
              "verified_role_id",
            ),
          ]);
          await Promise.all([
            pendingRoleId && typeof pendingRoleId === "string"
              ? member.roles.remove(pendingRoleId).catch(() => null)
              : null,
            verifiedRoleId && typeof verifiedRoleId === "string"
              ? member.roles.add(verifiedRoleId).catch(() => null)
              : null,
          ]);
        }

        await interaction.update(
          makeSuccessCard("Verified!", "You passed. Welcome!"),
        );
        return;
      }

      // ── Correct but not done yet — disable clicked button, update progress ──
      await this.container.redis.set(
        key,
        JSON.stringify(state),
        "EXAT",
        Math.floor(state.expiresAt / 1000),
      );

      const correctSoFar = new Set(state.sequence.slice(0, state.progress));
      const seqDisplay = state.sequence.map((i) => EMOJI_POOL[i]).join("  ");
      const rows = buildRows(guildId, userId, state.buttons, correctSoFar);

      await interaction.update(
        makeInfoCard(
          `${state.progress}/${state.sequence.length} correct — keep going!`,
          `Click the emoji **in this exact order**:\n\n## ${seqDisplay}\n\n*${state.attempts} attempt(s) remaining.*`,
          { actionRows: rows },
        ),
      );
    } else {
      // ── Wrong click ──────────────────────────────────────────────────────
      state.progress = 0;
      state.attempts--;

      if (state.attempts <= 0) {
        await this.container.redis
          .multi()
          .del(key)
          .zrem(VerifyKeys.pendingSet(guildId), userId)
          .exec();
        await interaction.update(
          makeErrorCard(
            "Failed",
            "Too many wrong attempts. Please contact a moderator to be verified manually.",
          ),
        );
        return;
      }

      await this.container.redis.set(
        key,
        JSON.stringify(state),
        "EXAT",
        Math.floor(state.expiresAt / 1000),
      );

      const seqDisplay = state.sequence.map((i) => EMOJI_POOL[i]).join("  ");
      const rows = buildRows(guildId, userId, state.buttons, new Set());

      await interaction.update(
        makeWarningCard(
          "Wrong — sequence reset!",
          `Start over from the beginning.\n\n## ${seqDisplay}\n\n*${state.attempts} attempt(s) remaining.*`,
          { actionRows: rows },
        ),
      );
    }
  }
}
