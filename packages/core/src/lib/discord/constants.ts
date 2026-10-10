export const MessageFlags = {
  Crossposted: 1,
  IsCrosspost: 2,
  SuppressEmbeds: 4,
  SourceMessageDeleted: 8,
  Urgent: 16,
  HasThread: 32,
  Ephemeral: 64,
  Loading: 128,
  FailedToMentionSomeRolesInThread: 256,
  ShouldShowLinkNotDiscordWarning: 1024,
  SuppressNotifications: 4096,
  IsVoiceMessage: 8192,
  HasSnapshot: 16384,
  IsComponentsV2: 32768,
} as const;

export const ActivityType = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Custom: 4,
  Competing: 5,
} as const;
