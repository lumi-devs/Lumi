import { defineCustomId } from "#src/lib/interactions/CustomId.js";

export const PunishAuthorSelectId = defineCustomId("modqp:select", ["authorId"]);
export const PunishAuthorModalId = defineCustomId("modqp:modal", ["action", "authorId"]);
