# Thread Cleaner Module (`thread_cleaner`)

This document outlines the architecture and implementation of the `thread_cleaner` module in the `ember-ts` project.

## 1. Overview

The `thread_cleaner` module is responsible for automatically archiving threads in configured channels after a specified period of inactivity. This helps keep channel lists clean and manageable.

## 2. Architecture

The module consists of four main components:

### a. Data Layer (`TrackedThread` Model)

Persistence is handled by a dedicated PostgreSQL table, defined in `prisma/schema.prisma`.

-   **`TrackedThread`**: Stores a record for each thread currently being watched.
    -   `threadId`: The Discord ID of the thread.
    -   `guildId`: The guild the thread belongs to.
    -   `channelId`: The parent channel of the thread.
    -   `archiveAt`: The timestamp when the thread is scheduled to be archived.

This structured data approach is preferred over a generic KV store (`ModuleData`) for type safety and efficient querying, especially for the cleanup task which queries by the `archiveAt` field.

### b. Event Listener (`threadCreate`)

A Sapphire listener is bound to the `threadCreate` event. Its responsibilities are:

1.  Check if the `thread_cleaner` module is enabled for the guild.
2.  Retrieve the module's configuration for the guild (monitored channels, inactivity duration).
3.  If the thread was created within a monitored channel, it calculates the `archiveAt` timestamp.
4.  It then calls the data layer to persist a new `TrackedThread` record.

### c. Scheduled Task (`ThreadCleanerTask`)

A background task runs at a fixed interval (e.g., every 15 minutes) using the `@sapphire/plugin-scheduled-tasks` infrastructure, which is backed by a Redis/Bull queue.

The task's workflow is:

1.  Query the database for all `TrackedThread` records where `archiveAt` is in the past.
2.  For each expired record, attempt to fetch the thread from the Discord API.
3.  If the thread exists and is not already archived, archive it.
4.  Upon successful archival (or if the thread was already gone), delete the `TrackedThread` record from the database.
5.  Handle errors gracefully (e.g., missing permissions, thread deleted).

### d. Configuration (`/config thread_cleaner`)

Module configuration is handled via a slash command, allowing guild administrators to:

-   Enable or disable the module for their server.
-   Define a list of channels where new threads should be tracked.
-   Set the inactivity duration (e.g., "24h", "3d") before a thread is archived.

These settings are stored in the existing `GuildModuleConfig` table, following the established pattern for module configuration.

## 3. GDPR Compliance

The `ThreadCleanerModule` implements the `deleteUserData` hook. However, since the `TrackedThread` table does not store the thread's *creator* and only contains publicly available Discord IDs, no direct user data is stored. Therefore, the GDPR hook is currently a no-op as no PII is associated with the tracked entities. This can be revisited if the module's scope expands to include user-specific tracking.
