import type { ModuleLoader } from "@lumi/module-runtime";
import { isBotOwner, type Permit, type PermitRepository } from "@lumi/permits";
import type { CardReply } from "@lumi/ui";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import type {
  AssignFlow,
  CreateFlow,
  ExplainFlow,
  PermitFlow,
} from "../../permits/flows.js";
import type { MessageModalSubmit } from "../common.js";

export type PermitInteraction =
  ButtonInteraction | AnySelectMenuInteraction | MessageModalSubmit;

export type AnyPermitInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface PermitCardContext {
  readonly permitRepo: PermitRepository;
  readonly guildId: string;
  readonly moduleLoader: ModuleLoader;
  interaction: PermitInteraction;
  nodeCatalog(): Promise<string[]>;
  creatableNodeCatalog(): Promise<string[]>;
  canManageExtraOwnerPermit(permit: Pick<Permit, "nodes">): boolean;
  extraOwnerError(): CardReply;
  missingPermitCard(): CardReply;
}

export interface PermitHost extends PermitCardContext {
  mainCard(page: number): Promise<CardReply>;
  reorderCard(page: number): Promise<CardReply>;
  detailCard(permitId: number): Promise<CardReply>;
  unassignCard(permitId: number): Promise<CardReply>;
  deleteCard(permitId: number): Promise<CardReply>;
  createCard(flow: CreateFlow): Promise<CardReply>;
  explainCard(flow: ExplainFlow): CardReply;
  assignCard(flow: AssignFlow): Promise<CardReply>;
  assignExpiryCard(flow: AssignFlow): Promise<CardReply>;
  flowKey(): string;
  getFlow(key?: string): PermitFlow | undefined;
  setFlow(flow: PermitFlow, key?: string): void;
  clearFlow(): void;
}

export function isExtraOwnerPermit(permit: Pick<Permit, "nodes">): boolean {
  return permit.nodes.includes("*");
}

export function canManageExtraOwnerPermit(
  context: Pick<PermitCardContext, "interaction">,
  permit: Pick<Permit, "nodes">,
): boolean {
  return !isExtraOwnerPermit(permit) || isBotOwner(context.interaction.user.id);
}
