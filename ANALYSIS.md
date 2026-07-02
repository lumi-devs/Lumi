# ANALYSIS.md

## Existing Module Gap Analysis

| Module | Missing vs Skyra/YAGPDB | Effort | Fits Lumi |
|----------|----------|----------|----------|
| filter | Rule engine, regex rules, domain allow/block lists, invite detection, duplicate/spam detection, caps filter, mass mention filter, per-rule actions, per-channel overrides | M | Yes |
| filter | Rule priorities and action pipelines | M | Yes |
| mod | Structured reasons, appeal workflow, richer case history, audit-log correlation, bulk moderation tooling | M | Yes |
| mod | Expiring sanctions reconciliation and recovery guarantees | S | Yes |
| mod | Moderator notes and evidence attachments | M | Yes |
| cases | Pagination UI, filtering, search, moderator-centric views | S | Yes |
| tempvc | Ownership controls, transfer ownership, lock/unlock, bitrate/user-limit controls | M | Yes |
| tempvc | Persistent room preferences | M | Yes |
| afk | Scheduled expiry, keyword triggers, advanced mention summaries | S | Yes |
| utility | Self-service workflows and richer automation | M | Yes |
| dashboard | Live moderation/config management parity with bot commands | M | Yes |

---

## Missing Major Modules

### Audit/Event Logging
Features:
- Message delete/edit
- Mod actions
- Role changes
- Voice activity
- Channel changes

Prisma:
- GuildLogConfig

Tasks:
- Retention cleanup

Config:
- logChannels
- enabledEvents

Priority: High

---

### Leveling / XP
Features:
- XP gain
- Rank cards
- Leaderboards
- Role rewards

Prisma:
- GuildLevelConfig
- MemberXP

Tasks:
- XP decay (optional)

Config:
- xpEnabled
- xpCooldown
- rewardRoles

Priority: High

---

### Self Roles / Reaction Roles
Prisma:
- SelfRoleGroup
- SelfRoleEntry

Config:
- selfRolesEnabled

Priority: High

---

### Reminders
Prisma:
- Reminder

Tasks:
- Reminder delivery queue

Priority: High

---

### Starboard
Prisma:
- StarboardConfig
- StarboardEntry

Tasks:
- Sync/rebuild jobs

Priority: Medium

---

### Giveaways
Prisma:
- Giveaway
- GiveawayEntry

Tasks:
- End giveaway scheduler

Priority: Medium

---

### Suggestions / Polls
Prisma:
- Suggestion
- Poll

Priority: Medium

---

### Custom Commands / Tags
Prisma:
- Tag
- TagRevision

Priority: Medium

---

## Deepen Existing Strengths

### 1. Filter (Highest Priority)

Target:
YAGPDB-style automod engine.

Add:
- Rule abstraction
- Rule types:
  - invite
  - massMention
  - spam
  - duplicate
  - caps
  - regex
  - domain
- Actions:
  - delete
  - warn
  - timeout
  - quarantine
- Allowlists
- Channel/role overrides
- Rule ordering

Architecture:
- FilterService owns evaluation pipeline
- ConfigSchema → ConfigField[]
- InvalidationBus cache refresh

---

### 2. Moderation

Add:
- Reason enforcement
- Audit-log correlation
- Appeals
- Evidence URLs
- Duration parsing via Duration
- Case filtering
- Chunk/button pagination
- Expiry recovery using reconcileExpiryJobs

---

### 3. TempVC

Add:
- Control panel
- Rename
- Lock/unlock
- User limit
- Ownership transfer
- Privacy toggle

Interaction-handler driven.

---

## Proposed New Module: Audit Logging

@Module
logging

Why first:
- Complements mod/filter
- High admin demand
- Low gameplay complexity
- Reuses existing infra

Models:
- GuildLogConfig

Services:
- LoggingService

Config:
- enabledEvents
- destinationChannels
- retentionDays

Events:
- messageDelete
- messageUpdate
- memberUpdate
- roleUpdate
- channelUpdate
- mod actions

Runtime:
- monolith/worker safe
- container.db only
- RedisKeys + InvalidationBus

Dashboard RPC:
- getLoggingConfig
- updateLoggingConfig
- testLoggingRoute

## Roadmap

P1:
1. Filter overhaul
2. Moderation depth
3. Logging module

P2:
4. TempVC controls
5. Leveling

P3:
6. Self roles
7. Reminders
8. Starboard

P4:
9. Giveaways
10. Suggestions
11. Tags/custom commands
