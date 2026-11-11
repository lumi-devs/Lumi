CREATE TABLE "module_data" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "module_name" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_data_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "module_data_guild_id_module_name_target_id_key_key" ON "module_data"("guild_id", "module_name", "target_id", "key");

CREATE INDEX "module_data_guild_id_module_name_idx" ON "module_data"("guild_id", "module_name");

CREATE INDEX "module_data_module_name_target_id_idx" ON "module_data"("module_name", "target_id");

CREATE INDEX "module_data_expires_at_idx" ON "module_data"("expires_at");

ALTER TABLE "module_data" ADD CONSTRAINT "module_data_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
