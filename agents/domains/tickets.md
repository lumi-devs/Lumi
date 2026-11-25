# Tickets

Module: `modules/community/tickets/` (`tickets`, config key
`tickets`). The module is
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
| `commands/`         | `/ticket` command group, split by subcommand                  |
| `interactions.ts`   | Panel buttons/selects, menu/text open flow, feedback buttons  |
| `sessions.ts`       | Short-lived open-session state shared through cache           |
| `policy.ts`         | Opening policy checks and category claiming/feedback rules    |
| `autotags.ts`       | Regex auto-tag matching and automatic replies                 |
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
   Categories hold staff/ping/required roles, up to five text or menu questions,
   an opening message, cooldown and open-ticket limits, claiming/feedback
   toggles, a thread naming template, and a default priority.
2. `/ticket setup panel` posts a Components V2 card in a text/announcement
   channel. The card has a category string select and an **Open Ticket** button;
   `TicketPanel` stores the channel, message ID, title, description, and category
   IDs.
3. Selecting a category (or pressing Open Ticket for the panel's first category)
   checks module state, blacklist, required roles, per-user/category limits, and
   cooldown. Text-only categories open a modal; categories with menu questions
   start a short-lived session and show one select per menu question (optional
   questions get a Skip button), followed by a modal for any text questions.
4. When the flow completes the module re-checks policy and creates a private
   thread in the panel channel, adds the opener, creates a `Ticket`, archives an
   initial question/answer summary, and posts an opened-ticket card with the
   category opening message that pings the category ping roles. The opener
   receives an ephemeral link to the thread.
5. Every message in an open ticket thread is archived to `TicketMessage` with
   HTML-escaped content and attachment metadata. Non-bot messages refresh
   `Ticket.lastActivityAt`; the first non-opener message records
   `firstResponseAt`/`firstResponseBy`. Messages matching an auto-tag regex
   receive a single canned reply per tag per ticket.
6. Staff claim/unclaim, set priority, add notes, add/remove members, send tags,
   and manage tags/blacklist from inside the thread. Claiming respects the
   category toggle and records `claimedAt`. Claim and release use conditional
   `updateMany` writes: non-admin claim only succeeds while `claimedBy` is null,
   admin claim only replaces a different claimant, and release only clears the
   caller's own claim (admins can clear any). A zero-row update reports that the
   claim changed instead of overwriting the winner. The opener or staff can
   close.
7. Closing fetches any messages missing from the archive, renders a complete
   escaped HTML transcript, writes it to disk, uploads it to the configured
   transcript channel, stores the URL/path in `Ticket.transcriptUrl`, sets
   `closedAt`/`closedBy`/`closeReason`, sends a 1-5 feedback prompt when enabled
   globally and for the category, then locks and archives the thread.
8. Feedback can be submitted once by the opener through the prompt buttons or
   `/ticket feedback`.

A five-minute scheduler task (`auto-close`) closes open tickets whose
`lastActivityAt` is older than the guild's `autoCloseMinutes` when
`autoCloseEnabled` is on. It uses `selectInactiveTickets`, closes through the
normal close/transcript path, and records `closedBy = "system"`. The shared
scheduler holds a distributed lock per tick, so replicas do not double-close.

A daily `retention-cleanup` task deletes closed ticket rows (and their local
HTML transcripts) older than the guild's `retentionDays` when it is greater than
zero. Uploaded transcript-channel messages are not deleted.

## Commands

All commands live under `/ticket`.

| Command                                                | Who             | Purpose                                                                     |
| ------------------------------------------------------ | --------------- | --------------------------------------------------------------------------- |
| `/ticket setup panel`                                  | Admin           | Post a ticket panel                                                         |
| `/ticket category add`                                 | Admin           | Create a category                                                           |
| `/ticket category edit`                                | Admin           | Edit roles, policy, opening message, questions, template, priority, enabled |
| `/ticket category remove`                              | Admin           | Delete a category and detach it from panels                                 |
| `/ticket category list`                                | Admin           | List categories and their settings                                          |
| `/ticket close`                                        | Opener or staff | Close, transcript, lock/archive                                             |
| `/ticket claim` / `unclaim`                            | Staff           | Claim/assign or release a ticket                                            |
| `/ticket priority`                                     | Staff           | Set low/normal/high/urgent                                                  |
| `/ticket note`                                         | Staff           | Add an internal note included in the transcript                             |
| `/ticket add` / `remove`                               | Staff           | Add/remove a thread member                                                  |
| `/ticket blacklist add` / `remove` / `list`            | Staff           | Manage members barred from opening                                          |
| `/ticket tag add` / `edit` / `remove` / `list` / `use` | Staff           | Manage canned replies, regex auto-tags, and posting                         |
| `/ticket feedback`                                     | Opener          | Rate a closed ticket once                                                   |
| `/ticket info`                                         | Opener or staff | Show ticket metadata, notes, feedback                                       |
| `/ticket list`                                         | Staff           | List open, closed, or all tickets                                           |

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

Menu questions use `type: "menu"`, one to 25 `options`, and optional
`minValues`/`maxValues` (default 1):

```json
[
  {
    "type": "menu",
    "label": "Which service?",
    "required": true,
    "options": [
      { "label": "Billing", "description": "Invoices and payments" },
      { "label": "Technical", "description": "Bugs and outages" }
    ]
  },
  { "type": "text", "label": "Anything else?", "style": "long" }
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
  `ticket-<ticketId>.html`; uploaded messages are not removed by retention. If
  no channel is configured the local relative path is stored in
  `transcriptUrl`.
- Local transcript files are removed when `retentionDays` prunes a closed
  ticket.
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
| `retentionDays`       | number  | `0`     | Delete closed tickets/transcripts after days |
| `staffRoleIds`        | role[]  | `[]`    | Extra roles treated as ticket staff          |
| `autoCloseEnabled`    | boolean | `true`  | Enable inactivity closing                    |
| `autoCloseMinutes`    | number  | `1440`  | Inactivity window in minutes                 |
| `feedbackEnabled`     | boolean | `true`  | Send the post-close feedback prompt          |
| `maxOpenPerUser`      | number  | `3`     | Maximum simultaneous open tickets per member |
| `mentionStaffOnOpen`  | boolean | `true`  | Ping category ping/staff roles on open       |
| `autoTagEnabled`      | boolean | `true`  | Send regex-triggered canned replies          |

## Database tables

- `TicketPanel` — panel channel, message, title, description, category IDs.
- `TicketCategory` — staff/ping/required roles, questions JSON, opening message,
  cooldown/limits, claiming/feedback toggles, naming template, default priority,
  position, enabled.
- `Ticket` — channel/thread ID, opener, status, claim/claim time, first response,
  priority, subject, close metadata, transcript URL, feedback, last activity.
- `TicketMessage` — escaped message archive with attachment metadata.
- `TicketNote` — internal staff notes included in transcripts.
- `TicketBlacklist` — guild/user blacklist with reason and creator.
- `TicketTag` — guild canned replies with optional auto-tag regex.
- `TicketTagApplication` — records which auto-tags were applied to a ticket.

The schema and migration are owned by the database package; the module does not
alter them.
