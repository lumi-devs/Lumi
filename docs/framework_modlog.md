# Framework: Modlog

Moderation cases are `moderationCase` rows with a per-guild case-number
counter (reserved atomically). Core actions are a closed enum; anything
else is a custom case type.

## Case types

Modules register their types at load; guilds override enabled/channel/
emoji per type in `case_type_settings`:

```ts
import { registerCaseTypes, fileCase } from "#src/lib/api/moderation/CaseTypes.js";

registerCaseTypes({ name: "spam-wave", emoji: "🌊" });

await fileCase(services, {
  guildId, type: "spam-wave", userId, moderatorId,
  reason, actor, color,
});
```

`fileCase` skips disabled types, stores core actions under the enum and
custom ones under `customAction`, and posts to the modlog. `resolveCaseType`
reads the merged definition; `setCaseType` writes the guild override.

## Posting

`logToChannel(services, guildId, action, color, targetId, actor, reason,
caseNumber, moduleName?, { channelId? })` routes through the `guild-log`
utility, which posts to the module's `log_channel_id` unless a casetype
channel override wins. Cases list/filter through
`services.db.moderation` (`listCases`, `getActiveCases`, `liftModerationCases`).
