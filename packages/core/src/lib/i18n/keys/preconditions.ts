/** `preconditions:` keys: the denial messages every precondition can return. */
export const PreconditionsKeys = {
  Moderator: "preconditions:moderator",
  Administrator: "preconditions:administrator",
  GuildOwner: "preconditions:guildOwner",
  BotOwner: "preconditions:botOwner",
  ModuleDisabled: "preconditions:moduleDisabled",
  PermissionDenied: "preconditions:permissionDenied",
} as const;
