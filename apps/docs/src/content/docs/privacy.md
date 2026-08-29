---
title: Data Privacy & GDPR
description: Learn how Lumi complies with GDPR, automated data retention schedules, and modular data erasure contracts.
category: Core Architecture
---

# Data Privacy & GDPR Architecture

Lumi is architected with strict, privacy-by-default data governance designed to comply fully with the European Union General Data Protection Regulation (GDPR) and global data sovereignty principles.

## Core Privacy Principles

1. **Self-Hosted Ownership**: Lumi operates entirely within your own self-hosted infrastructure (PostgreSQL and Redis). No telemetry or user data is ever transmitted to third-party tracking services or hosted cloud aggregators.
2. **Zero-Trace Addons**: Addons must declare an explicit `end_user_data_statement` in their `info.json` manifest explaining what data they collect and maintain an implemented `deleteUserData(userId)` lifecycle hook.
3. **Automated Data Minimization**: Expired moderation cases, transient audit logs, and stale ephemeral records are purged continuously through scheduled retention sweeps.

---

## Data Retention & Sweeps

Lumi schedules an automated daily background sweep (`data-retention-sweep`) registered in the core runtime module:

```ts
// packages/core/src/modules/core/scheduled-tasks/dataRetention.ts
export class DataRetentionSweepTask extends RelayTask {
  public override async fire(): Promise<void> {
    const auditRetentionDays = 90;
    const modRetentionDays = 365;

    await this.container.db.audit.purgeOldEntries(auditRetentionDays);
    await this.container.db.moderation.purgeOldCases(modRetentionDays);
  }
}
```

### Retention Timelines

| Ledger / Table | Retention Period | Action |
| :--- | :--- | :--- |
| **Audit Log Entries** | 90 Days | Hard delete via `AuditRepository.purgeOldEntries` |
| **Expired Moderation Cases** | 365 Days | Automatic purge via `ModerationRepository.purgeOldCases` |
| **Dashboard Redis Sessions** | 24 Hours | Key expiration (`EXPIRE`) via Redis TTL |
| **Rate Limit Buckets** | 60 Seconds | Memory / Redis sliding window purge |

---

## Right to Erasure (`deleteUserData`)

When a user exercises their Right to Erasure (Article 17 GDPR), Lumi invokes the `deleteUserData` method across all active modules and 3rd-party addons:

```ts
import { DefineModule, Module } from "lumi";

@DefineModule({
  name: "custom-tags",
  displayName: "Custom Tags",
  version: "1.0.0",
  description: "User-defined tags with automated data cleanup.",
})
export class CustomTagsModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    // Purge or anonymize any user-scoped entries in the key-value store
    await this.container.db.guildKV.deleteByUser(userId);
  }
}
```

---

## Addon Manifest Privacy Statements

Every addon manifest must declare a human-readable data disclosure:

```json
{
  "name": "hello-world",
  "version": "1.0.0",
  "end_user_data_statement": "This addon does not collect or store any personal end-user data."
}
```

If an addon omits this field, the Lumi Downloader & validator will reject the manifest during validation.

---

## Web Dashboard Cookie Consent

The Next.js web dashboard uses minimal, essential authentication cookies to manage authenticated sessions. A client-side consent banner is displayed on first load, respecting user preferences and storing consent locally in `localStorage`.
