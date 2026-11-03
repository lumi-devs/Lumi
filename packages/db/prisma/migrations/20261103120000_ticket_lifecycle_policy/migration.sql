-- Ticket lifecycle
ALTER TABLE "tickets"
    ADD COLUMN "claimed_at" TIMESTAMP(3),
    ADD COLUMN "first_response_at" TIMESTAMP(3),
    ADD COLUMN "first_response_by" TEXT;

-- Ticket category policy
ALTER TABLE "ticket_categories"
    ADD COLUMN "required_role_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "opening_message" TEXT,
    ADD COLUMN "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "member_limit" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "total_limit" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "claiming_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "feedback_enabled" BOOLEAN NOT NULL DEFAULT true;

-- Auto-tagging
ALTER TABLE "ticket_tags"
    ADD COLUMN "regex" TEXT,
    ADD COLUMN "auto_tag" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ticket_tag_applications" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_tag_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_tag_applications_ticket_id_tag_id_key"
    ON "ticket_tag_applications"("ticket_id", "tag_id");
CREATE INDEX "ticket_tag_applications_ticket_id_idx"
    ON "ticket_tag_applications"("ticket_id");

ALTER TABLE "ticket_tag_applications"
    ADD CONSTRAINT "ticket_tag_applications_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_tag_applications"
    ADD CONSTRAINT "ticket_tag_applications_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "ticket_tags"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Lifecycle/statistics indexes
CREATE INDEX "tickets_guild_id_status_closed_at_idx"
    ON "tickets"("guild_id", "status", "closed_at");
CREATE INDEX "tickets_guild_id_first_response_by_idx"
    ON "tickets"("guild_id", "first_response_by");
