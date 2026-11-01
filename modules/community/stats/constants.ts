export const StatsModuleName = "stats";
export const StatsConfigKey = "stats";
export const StatsPermitNode = "stats.view";

export const LookbackValues = ["1d", "7d", "30d", "60d"] as const;
export type Lookback = (typeof LookbackValues)[number];
export const DefaultLookback: Lookback = "7d";

export const MaxLookbackDays = 60;
export const RetentionDays = 90;
export const SnapshotIntervalMinutes = 10;
export const MessageBucketMinutes = 60;
export const VoiceBucketMinutes = 1;

export const StatsEventTypes = ["join", "leave", "boost", "unboost"] as const;
export type StatsEventType = (typeof StatsEventTypes)[number];
