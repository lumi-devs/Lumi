# Tickets

Module: `modules/tickets/` (`tickets`, config key `tickets`). The module is
toggleable per guild; when disabled its commands, listeners, and auto-close
sweep stop for that guild.

Tickets are **private threads only**. The module never creates a ticket text
channel. A panel posted in a normal text or announcement channel is the parent
for every private thread it opens.

## Files

| File                | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `manifest.json`     | Module metadata and `/lumi` config controls                   |
| `index.ts`          | Module definition, command/listener registration, sweep timer |
| `commands.ts`       | `/ticket` command group and all subcommands                   |
| `interactions.ts`   | Panel buttons/selects, open modal, feedback buttons           |
| `panel.ts`          | Components V2 panel, opened-ticket, and info cards            |
| `config.ts`         | Zod config and question/id parsing                            |
| `access.ts`         | Manager, permit, and category staff-role checks               |
| `repository.ts`     | Prisma reads and message archive helpers                      |
| `ticket-service.ts` | Close/transcript/feedback flow and inactivity sweep           |
| `transcript.ts`     | HTML file write and transcript-channel upload                 |
| `html.ts`           | Escaping and HTML transcript renderer                         |
| `naming.ts`         | Thread naming template and sanitization                       |
| `validation.ts`     | Close and feedback validation                                 |
| `inactivity.ts`     | Pure inactive-ticket selection                                |
| `listeners.ts`      | `messageCreate` archiving                                     |

## Flow

1. An admin runs `/ticket category add` to create at least one enabled category.
   Categories hold staff roles, ping roles, up to five modal questions, a thread
   naming template, and a default priority.
2. `/ticket setup panel` posts a Components V2 card in a text/announcement
   channel. The card has a category string select and an **Open Ticket** button;
   `TicketPanel` stores the channel, message ID, title, description, and category
   IDs.
3. Selecting a category (or pressing Open Ticket for the panel's first category)
   checks module state, blacklist, and the per-user open limit, then opens a
   modal with the category's questions. Categories without questions receive a
   default "Briefly describe your issue" question.
4. On modal submit the module creates a private thread in the panel channel,
   adds the opener, creates a `Ticket`, archives an initial question/answer
   summary, and posts an opened-ticket card that pings the category ping and
   staff roles. The opener receives an ephemeral link to the thread.
5. Every message in an open ticket thread is archived to `TicketMessage` with
   HTML-escaped content and attachment metadata. Non-bot messages refresh
   `Ticket.lastActivityAt`.
6. Staff claim/unclaim, set priority, add notes, add/remove members, send tags,
   and manage tags/blacklist from inside the thread. The opener or staff can
   close.
7. Closing fetches any messages missing from the archive, renders a complete
   escaped HTML transcript, writes it to disk, uploads it to the configured
   transcript channel, stores the URL/path in `Ticket.transcriptUrl`, sets
   `closedAt`/`closedBy`/`closeReason`, sends a 1-5 feedback prompt, then locks
   and archives the thread.
8. Feedback can be submitted once by the opener through the prompt buttons or
   `/ticket feedback`.

A five-minute scheduler task (`auto-close`) closes open tickets whose
`lastActivityAt` is older than the guild's `autoCloseMinutes` when
`autoCloseEnabled` is on. It uses `selectInactiveTickets`, closes through the
normal close/transcript path, and records `closedBy = "system"`. The shared
scheduler holds a distributed lock per tick, so replicas do not double-close.

## Commands

All commands live under `/ticket`.

| Command                                       | Who             | Purpose                                                                      |
| --------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `/ticket setup panel`                         | Admin           | Post a ticket panel                                                          |
| `/ticket category add`                        | Admin           | Create a category                                                            |
| `/ticket category edit`                       | Admin           | Edit name, emoji, description, roles, template, priority, questions, enabled |
| `/ticket category remove`                     | Admin           | Delete a category and detach it from panels                                  |
| `/ticket category list`                       | Admin           | List categories and their settings                                           |
| `/ticket close`                               | Opener or staff | Close, transcript, lock/archive                                              |
| `/ticket claim` / `unclaim`                   | Staff           | Claim/assign or release a ticket                                             |
| `/ticket priority`                            | Staff           | Set low/normal/high/urgent                                                   |
| `/ticket note`                                | Staff           | Add an internal note included in the transcript                              |
| `/ticket add` / `remove`                      | Staff           | Add/remove a thread member                                                   |
| `/ticket blacklist add` / `remove` / `list`   | Staff           | Manage members barred from opening                                           |
| `/ticket tag add` / `remove` / `list` / `use` | Staff           | Manage and post canned replies                                               |
| `/ticket feedback`                            | Opener          | Rate a closed ticket once                                                    |
| `/ticket info`                                | Opener or staff | Show ticket metadata, notes, feedback                                        |
| `/ticket list`                                | Staff           | List open, closed, or all tickets                                            |

Category questions are supplied as a JSON array:

```json
[
  {
    "label": "What do you need help with?",
    "style": "short",
    "required": true
  },
  {
    "label": "Add any details",
    "style": "long",
    "required": false,
    "maxLength": 1024
  }
]
```

Thread naming templates support `{user}` (display name), `{username}`,
`{id}`, `{category}`, and `{number}`. Names are sanitized to Discord-safe
characters and capped at 100 characters.

## Permissions

- `tickets.admin` permit, guild owner, Discord **Administrator**, or **Manage
  Server** gates setup, category management, and admin service actions.
- `tickets.manage` permit, category `staffRoleIds`, the config
  `staffRoleIds`, or a manager gates staff actions (claim, priority, notes,
  members, tags, blacklist, list).
- The category's staff roles are additive access on top of permits and global
  staff roles.
- The opener can close their own ticket, view its info, and leave feedback.
- Ticket blacklist checks happen before a modal opens and again before the
  ticket row is created.

## Transcript storage and escaping

- Files are written to `data/transcripts/<guildId>/<ticketId>.html`.
- The same HTML is uploaded to `transcriptChannelId` as
  `ticket-<ticketId>.html`; there is no expiry. If no channel is configured the
  local relative path is stored in `transcriptUrl`.
- Message content is stored HTML-escaped in `TicketMessage.content`. The
  renderer escapes ticket metadata, category, subject, note text, author names,
  attachment names/URLs, and message content before writing HTML (archived
  message content is normalized first so it is escaped exactly once).
- The transcript includes ticket ID, guild, category, opener, subject, status,
  priority, claim, timestamps, close reason, staff notes, every archived message,
  and attachment links.

## Config

| Key                   | Type    | Default | Meaning                                      |
| --------------------- | ------- | ------- | -------------------------------------------- |
| `transcriptChannelId` | channel | `null`  | Upload target for HTML transcripts           |
| `staffRoleIds`        | role[]  | `[]`    | Extra roles treated as ticket staff          |
| `autoCloseEnabled`    | boolean | `true`  | Enable inactivity closing                    |
| `autoCloseMinutes`    | number  | `1440`  | Inactivity window in minutes                 |
| `feedbackEnabled`     | boolean | `true`  | Send the post-close feedback prompt          |
| `maxOpenPerUser`      | number  | `3`     | Maximum simultaneous open tickets per member |
| `mentionStaffOnOpen`  | boolean | `true`  | Ping category ping/staff roles on open       |

## Database tables

- `TicketPanel` — panel channel, message, title, description, category IDs.
- `TicketCategory` — staff/ping roles, questions JSON, naming template, default
  priority, position, enabled.
- `Ticket` — channel/thread ID, opener, status, claim, priority, subject, close
  metadata, transcript URL, feedback, last activity.
- `TicketMessage` — escaped message archive with attachment metadata.
- `TicketNote` — internal staff notes included in transcripts.
- `TicketBlacklist` — guild/user blacklist with reason and creator.
- `TicketTag` — guild canned replies used by `/ticket tag use`.

The schema and migration are owned by the database package; the module does not
alter them.
