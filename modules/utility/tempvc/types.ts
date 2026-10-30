import type {
  MessageComponentInteraction,
  ModalSubmitFields,
  ModalSubmitInteraction,
} from "discord.js";

export type TempVcInteraction = (
  MessageComponentInteraction | ModalSubmitInteraction
) & {
  readonly values?: readonly string[];
  readonly fields?: ModalSubmitFields;
};
