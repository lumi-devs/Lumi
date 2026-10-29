import type { ModuleLoader } from "@lumi/module-runtime";
import {
  isBotOwner,
  type Permit,
  type PermitRepository,
} from "@lumi/permits";
import type { CardReply } from "@lumi/ui";
import type {
  AssignFlow,
  CreateFlow,
  ExplainFlow,
  PermitFlow,
} from "../permits/flows.js";
import {
  clearPermitFlow,
  getPermitFlow,
  permitFlowKey,
  setPermitFlow,
} from "../permits/flows.js";
import { permitNodeCatalog } from "../permits/nodes.js";
import {
  handleAssignAction,
  handleAssignSelect,
} from "./permit/assignActions.js";
import {
  assignCard,
  assignExpiryCard,
  explainCard,
} from "./permit/assignViews.js";
import {
  handleCreateAction,
  handleCreateNameSubmit,
  handleCreateSelect,
} from "./permit/createActions.js";
import { createCard } from "./permit/createView.js";
import { deleteCard, detailCard, unassignCard } from "./permit/detailViews.js";
import { handleEditSubmit } from "./permit/editDialog.js";
import {
  handleExplainAction,
  handleExplainSelect,
} from "./permit/explainActions.js";
import {
  type AnyPermitInteraction,
  canManageExtraOwnerPermit,
  type PermitHost,
  type PermitInteraction,
} from "./permit/host.js";
import { handleListAction, handleListSelect } from "./permit/listActions.js";
import {
  extraOwnerError,
  mainCard,
  missingPermitCard,
  reorderCard,
} from "./permit/listViews.js";

interface PermitPanelOptions {
  permitRepo: PermitRepository;
  guildId: string;
  interaction: AnyPermitInteraction;
  moduleLoader: ModuleLoader;
}

export class PermitPanel implements PermitHost {
  readonly permitRepo: PermitRepository;
  readonly guildId: string;
  readonly moduleLoader: ModuleLoader;
  interaction: PermitInteraction;
  private catalog?: string[];
  private creatableCatalog?: string[];

  constructor(options: PermitPanelOptions) {
    this.permitRepo = options.permitRepo;
    this.guildId = options.guildId;
    this.moduleLoader = options.moduleLoader;
    this.interaction = options.interaction as PermitInteraction;
  }

  async render(): Promise<void> {
    await this.interaction.deferUpdate();
    await this.interaction.editReply(await this.mainCard(0));
  }

  canManageExtraOwnerPermit(permit: Pick<Permit, "nodes">): boolean {
    return canManageExtraOwnerPermit(this, permit);
  }

  extraOwnerError(): CardReply {
    return extraOwnerError();
  }

  missingPermitCard(): CardReply {
    return missingPermitCard();
  }

  async nodeCatalog(): Promise<string[]> {
    if (!this.catalog) {
      this.catalog = await permitNodeCatalog(
        this.permitRepo,
        this.moduleLoader,
        this.guildId,
      );
    }
    return this.catalog;
  }

  async creatableNodeCatalog(): Promise<string[]> {
    if (!this.creatableCatalog) {
      const nodes = await this.nodeCatalog();
      this.creatableCatalog = isBotOwner(this.interaction.user.id)
        ? nodes
        : nodes.filter((node) => node !== "*");
    }
    return this.creatableCatalog;
  }

  mainCard(page: number): Promise<CardReply> {
    return mainCard(this, page);
  }

  reorderCard(page: number): Promise<CardReply> {
    return reorderCard(this, page);
  }

  detailCard(permitId: number): Promise<CardReply> {
    return detailCard(this, permitId);
  }

  unassignCard(permitId: number): Promise<CardReply> {
    return unassignCard(this, permitId);
  }

  deleteCard(permitId: number): Promise<CardReply> {
    return deleteCard(this, permitId);
  }

  createCard(flow: CreateFlow): Promise<CardReply> {
    return createCard(this, flow);
  }

  explainCard(flow: ExplainFlow): CardReply {
    return explainCard(flow);
  }

  assignCard(flow: AssignFlow): Promise<CardReply> {
    return assignCard(this, flow);
  }

  assignExpiryCard(flow: AssignFlow): Promise<CardReply> {
    return assignExpiryCard(this, flow);
  }

  flowKey(): string {
    // Modals have no message; the create-name modal carries its key in the
    // custom id instead, so this fallback only applies to component clicks.
    const messageId = this.interaction.message?.id ?? this.interaction.customId;
    return permitFlowKey(messageId, this.interaction.user.id);
  }

  clearFlow(): void {
    clearPermitFlow(this.flowKey());
  }

  setFlow(flow: PermitFlow, key = this.flowKey()): void {
    setPermitFlow(key, flow);
  }

  getFlow(key = this.flowKey()): PermitFlow | undefined {
    return getPermitFlow(key);
  }

  async handleInteraction(interaction: PermitInteraction): Promise<void> {
    this.interaction = interaction;
    const customId = interaction.customId;

    if (await handleCreateAction(this, customId)) return;
    if (await handleExplainAction(this, customId)) return;
    if (await handleAssignAction(this, customId)) return;
    await handleListAction(this, customId);
  }

  async handleSelectMenu(interaction: PermitInteraction): Promise<void> {
    this.interaction = interaction;
    const customId = interaction.customId;

    if (await handleCreateSelect(this, customId)) return;
    if (await handleExplainSelect(this, customId)) return;
    if (await handleListSelect(this, customId)) return;
    await handleAssignSelect(this, customId);
  }

  async handleModalSubmit(interaction: AnyPermitInteraction): Promise<void> {
    this.interaction = interaction as PermitInteraction;
    const customId = interaction.customId;

    if (customId.startsWith("permit_create_name_modal:")) {
      await handleCreateNameSubmit(
        this,
        customId.slice("permit_create_name_modal:".length),
      );
      return;
    }
    if (customId.startsWith("permit_edit_modal:")) {
      await handleEditSubmit(this, Number(customId.split(":")[1]));
    }
  }

  async handleConfirmDelete(permitId: number): Promise<void> {
    await handleListAction(this, `permit_confirm_delete:${permitId}`);
  }
}
