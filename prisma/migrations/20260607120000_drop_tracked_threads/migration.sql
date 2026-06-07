-- The `thread-cleaner` module moved out of core into lumi-addons and no longer
-- uses a dedicated table — it schedules one BullMQ job per thread instead.
DROP TABLE IF EXISTS "tracked_threads";
