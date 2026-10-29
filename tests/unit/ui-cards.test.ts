import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  AccentColors,
  buildSafeActionRows,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "../../packages/ui/src/index.ts";

describe("card system", () => {
  it("builds a Components V2 reply with no embeds", () => {
    const card = makeInfoCard("Title", ["body"], { footer: "footer" });
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(card).not.toHaveProperty("embeds");
    expect(card.components).toHaveLength(1);
  });

  it("leaves the accent color unset on default cards", () => {
    const card = makeInfoCard("Title", "body");
    const container = JSON.parse(JSON.stringify(card.components[0]));
    expect(container.accent_color).toBeUndefined();
  });

  it("keeps semantic accent colors", () => {
    const card = makeSuccessCard("Title", "body");
    const container = JSON.parse(JSON.stringify(card.components[0]));
    expect(container.accent_color).toBe(AccentColors.success);
  });

  it("adds the ephemeral flag without dropping V2", () => {
    const card = ephemeralCard(makeErrorCard("Error", "Nope"));
    expect(card.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
  });

  it("caps action rows at five by five", () => {
    const rows = Array.from({ length: 7 }, () =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...Array.from(
          { length: 7 },
          (_, index) =>
            new ButtonBuilder()
              .setCustomId(`b:${index}`)
              .setLabel(`B${index}`)
              .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
    const safe = buildSafeActionRows(rows);
    expect(safe).toHaveLength(5);
    for (const row of safe) expect(row.components).toHaveLength(5);
  });
});
