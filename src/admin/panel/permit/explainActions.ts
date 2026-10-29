import { ButtonStyle } from "discord.js";
import {
  buildSafeActionRows,
  createActionButton,
  makeErrorCard,
  row,
} from "@lumi/ui";
import { roleIdsFrom } from "../../access.js";
import { errorMessage } from "../../../core/errors.js";
import { allExplanationCard } from "../../permits/explain.js";
import type { ExplainFlow } from "../../permits/flows.js";
import type { PermitHost } from "./host.js";

export async function handleExplainAction(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;

  if (customId === "permit_explain") {
    const flow: ExplainFlow = { kind: "explain", userId: undefined };
    host.setFlow(flow);
    await interaction.update(await host.explainCard(flow));
    return true;
  }

  if (customId !== "permit_explain_run") return false;

  const flow = host.getFlow();
  if (flow?.kind !== "explain" || flow.userId === undefined) {
    await interaction.update(
      flow?.kind === "explain" ? await host.explainCard(flow) : await host.mainCard(0),
    );
    return true;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.update(await host.mainCard(0));
    return true;
  }

  try {
    const member = await guild.members.fetch(flow.userId);
    const roleIds = roleIdsFrom(member, guild.id);
    const nodes = await host.nodeCatalog();
    const results = await host.permitRepo.explainPermitNodes(
      {
        guildId: host.guildId,
        userId: flow.userId,
        roleIds,
        guildOwnerId: guild.ownerId,
      },
      nodes,
      interaction.client,
    );
    const card = allExplanationCard(results, {
      userId: flow.userId,
      actionRows: buildSafeActionRows([
        row(
          createActionButton({
            customId: "permit_explain",
            label: "Check Another",
            style: ButtonStyle.Primary,
            emoji: "🔍",
          }),
          createActionButton({
            customId: "permit_back_main",
            label: "Back to Permits",
            style: ButtonStyle.Secondary,
            emoji: "⬅️",
          }),
        ),
      ]),
    });
    host.clearFlow();
    await interaction.update(card);
  } catch (error: unknown) {
    await interaction.update(
      makeErrorCard(
        "Check Failed",
        `Could not evaluate the permit: ${errorMessage(error)}`,
      ),
    );
  }
  return true;
}

export async function handleExplainSelect(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;
  if (customId !== "permit_explain_user" || !interaction.isUserSelectMenu()) {
    return false;
  }
  const flow = host.getFlow();
  if (flow?.kind !== "explain") {
    await interaction.update(await host.mainCard(0));
    return true;
  }
  const value = interaction.values[0];
  if (value === undefined) return true;
  flow.userId = value;
  host.setFlow(flow);
  await interaction.update(await host.explainCard(flow));
  return true;
}
