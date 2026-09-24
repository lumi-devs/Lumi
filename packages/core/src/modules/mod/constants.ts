import { defineCustomId } from "#lib/interactions/custom-id.js";

export const PunishAuthorSelectId = defineCustomId("modqp:select", ["authorId"]);
export const PunishAuthorModalId = defineCustomId("modqp:modal", ["action", "authorId"]);
