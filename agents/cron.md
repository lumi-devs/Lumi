# Cron

Package: `@lumi/cron` (`packages/cron`). Zero-dependency 5-field cron parsing, syntax validation, Vixie cron match evaluation, and timezone-aware schedule matching.

## Architecture

- Standalone package with no dependencies.
- Implements standard 5-field cron syntax: `minute hour day-of-month month day-of-week`.
- Follows Vixie cron semantics: when both `dayOfMonth` and `dayOfWeek` are restricted (non-wildcard), a schedule matches if **either** field matches. If either or both fields are wildcards (`*` or `?`), **both** must match.
- Normalizes English day and month abbreviations (`Sun`-`Sat`, `Jan`-`Dec`).
- Supports step values (`*/5`), ranges (`1-5`), and lists (`1,3,5`).
- In-memory bounded LRU cache for parsed cron expressions (up to 500 patterns).
- In-memory bounded cache for `Intl.DateTimeFormat` timezone formatters (up to 64 timezones).

## Key API

```ts
import { parseCron, matchesCron, zonedTimeParts, type ParsedCron } from "@lumi/cron";

// 1. Parse and validate syntax (throws Error on invalid expressions or out-of-range values)
const parsed: ParsedCron = parseCron("*/15 * * * *");

// 2. Check if a date matches a cron expression in a specific timezone (or UTC if omitted)
const isDue = matchesCron("0 12 * * Mon-Fri", new Date(), "America/New_York");

// 3. Extract zoned time components for custom schedule calculations
const parts = zonedTimeParts(new Date(), "Europe/London");
```

## Consumers

- `@lumi/scheduler` — Distributed cron scheduler using Redis distributed locks.
- `modules/utility/reminders` — Recurring reminder schedules with timezone offsets.

## Rules

- Keep `@lumi/cron` completely independent of external dependencies and Discord.js.
- Throw descriptive errors when parsing fails so callers can report user-friendly error messages.
- Always use UTC as the default when timezone is unspecified.
