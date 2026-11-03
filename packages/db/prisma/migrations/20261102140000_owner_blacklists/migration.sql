-- CreateTable
CREATE TABLE "guild_blacklist" (
    "guild_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_blacklist_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "user_blacklist" (
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blacklist_pkey" PRIMARY KEY ("user_id")
);
