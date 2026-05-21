# Raid Protection Guide

The Raids module is an invisible, high-performance shield for your server. Built specifically to mitigate mass-join attacks (bot raids), it operates entirely in the background using rolling time windows and automated verification scaling.

## How It Works

Ember tracks member join velocity in real-time. Instead of greeting users or sending bulky logging messages on every join, it quietly maintains a sliding window of join timestamps in memory. This "silent guardian" approach ensures that during normal operation, the module consumes minimal resources and doesn't clutter your audit logs.

### The Rolling Window

The system is controlled by three configurable parameters:
1. **Join Window:** A rolling timeframe (e.g., 10 seconds).
2. **Join Threshold:** The maximum number of joins allowed within that window (e.g., 10 joins).
3. **Lockdown Duration:** How long the server remains locked down once triggered (e.g., 30 minutes).

If the number of joins inside the **Join Window** ever exceeds the **Join Threshold**, the raid protection is immediately and autonomously triggered.

## The Lockdown Sequence

When a raid is detected, Ember takes immediate, decisive action without requiring moderator intervention.

1. **Verification Escalation:** Ember automatically raises your server's Discord Verification Level to **Highest** (Very High). This immediately stops new, unverified, or bot accounts from participating in the server, cutting off the raid's effectiveness at the source.
2. **Silent Operation:** There are no flashy UIs or panic-inducing channel pings by default. The lockdown is a structural change to the server settings, allowing moderators to breathe and assess the situation without chat disruption.
3. **Audit Logging:** The verification change is neatly logged in your server's native Discord Audit Log with the reason: `Raid detected — auto lockdown`.

## Automatic Restoration

You do not need to remember to unlock the server after the threat has passed.

When the lockdown is initiated, Ember schedules an automatic unlock job via its high-reliability message queue (**RabbitMQ**).

- **Precision Timing:** Once the configured **Lockdown Duration** expires, Ember perfectly restores your server's Verification Level back to exactly what it was before the raid began.
- **Audit Logging:** The restoration is also documented in the Audit Log with the reason: `Raid lockdown expired — auto restore`.
- **Failsafe Resilience:** Even if the bot is restarted during a lockdown, Ember persists the lockdown state in the database. Upon startup, it recalculates the remaining time and ensures the server is unlocked at the exact scheduled moment.

## Configuration

Administrators can fine-tune the raid protection via the dashboard or RPC interface:
- **Enabled:** Toggle the entire system on or off.
- **Alert Channel:** (Optional) Configure a specific channel where Ember will post a refined alert card when a lockdown is triggered, keeping your staff informed without alerting the general public.
