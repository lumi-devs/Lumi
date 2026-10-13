-- Reaction-role message lookup (`messageIds HAS id`) scans without this.
CREATE INDEX "reactionrole_menus_message_ids_gin" ON "reactionrole_menus" USING GIN ("message_ids");
