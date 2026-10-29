import { isBotOwner } from "@lumi/permits";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { errorMessage } from "../../../core/errors.js";
import type { CreateFlow } from "../../permits/flows.js";
import { defaultNamespace } from "../../permits/format.js";
import {
  isValidNode,
  namespaceForNode,
  suggestPermitName,
  uniquePermitName,
} from "../../permits/nodes.js";
import type { PermitHost } from "./host.js";

const SelectOptionLimit = 25;

/** Active create flow, or the permit list after resetting a stale one. */
async function activeCreateFlow(host: PermitHost): Promise<CreateFlow | null> {
  const flow = host.getFlow();
  if (flow?.kind === "create") return flow;
  await host.interaction.update(await host.mainCard(0));
  return null;
}

export function showCreateNameModal(host: PermitHost, flow: CreateFlow): Promise<void> {
  const interaction = host.interaction;
  if (!interaction.isButton()) return Promise.resolve();

  const modal = new ModalBuilder()
    .setCustomId(`permit_create_name_modal:${host.flowKey()}`)
    .setTitle("Name Permit");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Permit Name")
        .setStyle(TextInputStyle.Short)
        .setValue(flow.name ?? suggestPermitName(flow.nodes, flow.polarity))
        .setRequired(true)
        .setMaxLength(64),
    ),
  );
  return interaction.showModal(modal);
}
export async function handleCreateAction(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;

  if (customId === "permit_create") {
    const nodes = await host.creatableNodeCatalog();
    const flow: CreateFlow = {
      kind: "create",
      namespace: defaultNamespace(nodes),
      nodes: [],
      polarity: "Grant",
      name: undefined,
    };
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  if (customId === "permit_create_clear") {
    const flow = await activeCreateFlow(host);
    if (!flow) return true;
    flow.nodes = [];
    flow.name = undefined;
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  if (customId !== "permit_create_submit" && customId !== "permit_create_name") {
    return false;
  }

  const flow = host.getFlow();
  if (flow?.kind !== "create" || flow.nodes.length === 0) {
    await interaction.update(await host.mainCard(0));
    return true;
  }

  if (customId === "permit_create_name") {
    await showCreateNameModal(host, flow);
    return true;
  }

  if (flow.nodes.includes("*") && !isBotOwner(interaction.user.id)) {
    await interaction.reply(ephemeralCard(host.extraOwnerError()));
    return true;
  }

  try {
    const permits = await host.permitRepo.listPermits(host.guildId);
    const existingNames = new Set(permits.map((permit) => permit.name));
    const requested = flow.name?.trim();
    if (requested && existingNames.has(requested)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Name Taken",
            `A permit named **${requested}** already exists.`,
          ),
        ),
      );
      return true;
    }

    const name =
      requested ??
      uniquePermitName(existingNames, suggestPermitName(flow.nodes, flow.polarity));
    // New permits go last; `position` only needs to be past the current tail.
    const position = permits.reduce(
      (next, permit) => Math.max(next, permit.position + 1),
      0,
    );
    const permit = await host.permitRepo.createPermit({
      guildId: host.guildId,
      name,
      nodes: flow.nodes,
      polarity: flow.polarity,
      position,
    });
    host.clearFlow();
    await interaction.update(await host.detailCard(permit.id));
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard(
          "Permit Created",
          `**#${permit.number} ${permit.name}** is ready to use.`,
          { footer: `Permit #${permit.number}` },
        ),
      ),
    );
  } catch (error: unknown) {
    await interaction.followUp(
      ephemeralCard(
        makeErrorCard(
          "Create Failed",
          `Could not create the permit: ${errorMessage(error)}`,
        ),
      ),
    );
  }
  return true;
}

export async function handleCreateSelect(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;
  if (!interaction.isStringSelectMenu()) return false;

  if (customId === "permit_create_namespace") {
    const flow = await activeCreateFlow(host);
    if (!flow) return true;
    const value = interaction.values[0];
    if (value === undefined) return true;
    flow.namespace = value;
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  if (customId === "permit_create_node") {
    const flow = await activeCreateFlow(host);
    if (!flow) return true;
    const selected = interaction.values.filter(isValidNode);
    const otherNamespaces = flow.nodes.filter(
      (node) => namespaceForNode(node) !== flow.namespace,
    );
    const currentNamespace = selected.filter(
      (node) => namespaceForNode(node) === flow.namespace,
    );
    flow.nodes = [...otherNamespaces, ...currentNamespace].slice(0, SelectOptionLimit);
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  if (customId === "permit_create_node_remove") {
    const flow = await activeCreateFlow(host);
    if (!flow) return true;
    const removed = new Set(interaction.values);
    flow.nodes = flow.nodes.filter((node) => !removed.has(node));
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  if (customId === "permit_create_polarity") {
    const flow = await activeCreateFlow(host);
    if (!flow) return true;
    const value = interaction.values[0];
    if (value !== "Grant" && value !== "Deny") return true;
    flow.polarity = value;
    host.setFlow(flow);
    await interaction.update(await host.createCard(flow));
    return true;
  }

  return false;
}

export async function handleCreateNameSubmit(
  host: PermitHost,
  key: string,
): Promise<void> {
  const interaction = host.interaction;
  if (!interaction.isModalSubmit()) return;

  const flow = host.getFlow(key);
  if (flow?.kind !== "create") {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Permit Not Found", "That permit draft has expired."),
      ),
    );
    return;
  }
  const name = interaction.fields.getTextInputValue("name").trim();
  if (name.length === 0) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Missing Name", "Give the permit a name.")),
    );
    return;
  }
  flow.name = name.slice(0, 64);
  host.setFlow(flow, key);
  await interaction.update(await host.createCard(flow));
}
