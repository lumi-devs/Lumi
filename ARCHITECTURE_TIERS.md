# Ember Module Architecture: Tiers

This document outlines the architectural philosophy for Ember's features, dividing them into three distinct tiers. This separation ensures the core bot remains stable and lightweight, while allowing for a rich, extensible feature set.

---

## Tier 1: Core System (Internal - `src/core`)

These are the non-negotiable foundations of the bot platform itself. They are not "features" in the user-facing sense but are required for any other module to function. They are deeply integrated and are not designed to be disabled.

| Module/Service | Justification |
| :--- | :--- |
| **`settings`** | **Absolutely Core.** A centralized configuration command (`/config`) is the entry point for administering all other modules. |
| **`permissions_mgr`**| **Absolutely Core.** The entire system's security and command access control relies on a single, robust permissions service. |
| **`cog_manager`** | **Absolutely Core.** This is the module loader (`ModuleStore` in this project). It's the "M" in MVC; without it, nothing runs. |
| **`bot_logging`** | **Absolutely Core.** Provides the essential diagnostic and audit logging necessary for stability and security monitoring. |
| **`dev`** | **Absolutely Core.** Owner-only tools for debugging, raw data access, and emergency maintenance are critical for development and support. |
| **`mydata`** | **Absolutely Core.** GDPR/data privacy compliance is a legal and ethical requirement, not an optional feature. This must be built-in to hook into all other modules. |
| **`downloader`** | **Core Utility.** The administrative tool required to enable the Tier 3 ecosystem. |
| **`branding`** | **Core Utility.** An internal service for managing the bot's visual identity (colors, embeds). Not a user-facing module. |

---

## Tier 2: Official Modules (Bundled - `src/modules`)

These are the high-value, high-demand features that define the Ember bot experience. They are bundled with the main repository and are expected to be available "out-of-the-box," though they can be disabled by server administrators.

| Module | Justification |
| :--- | :--- |
| **`moderation`** | **Flagship Feature.** Includes warn/mute/kick/ban. This is the #1 reason admins choose a bot. Must be official. |
| **`filter`** | **Flagship Feature.** Auto-moderation (spam/word filters) is a direct companion to manual moderation. |
| **`welcome`** | **Flagship Feature.** Welcome/goodbye messages are a top-5 most requested bot feature and are crucial for community building. |
| **`verify`** | **Flagship Feature.** Verification/gate systems are a primary reason for adding a management bot. |
| **`reaction_roles`** | **Flagship Feature.** Allows users to get roles by clicking on a reaction or button. A top-tier utility for server setup. |
| **`starboard`** | **Flagship Community.** A highly popular feature for highlighting memorable community content. |
| **`tempvc`** | **Flagship Feature.** "Join to Create" VC is an extremely popular and sticky feature that drives bot adoption and retention. |
| **`afk`** | **Standard Community.** A highly requested and popular community feature. |
| **`polls`** | **Standard Utility.** A native, button-based polling system is a major quality-of-life feature for community engagement. |
| **`autoroles`** | **Standard Utility.** Automatically assigns a role to new members upon joining. A fundamental server setup tool. |
| **`reminders`** | **Standard Utility.** Lets users set personal or channel-wide reminders. A very "sticky" and useful feature. |
| **`thread_cleaner`**| **Standard Utility.** Automated channel maintenance that adds significant value for admins. |
| **`purge`** | **Standard Utility.** Essential bulk-delete moderation tool. |
| **`reports`** | **Standard Utility.** User reporting system for community safety. |
| **`user_media`** | **Standard Utility.** `avatar`, `banner`, etc. High-use commands. |
| **`general`** | **Standard Utility.** Includes **`ping`**. Basic bot commands (`stats`, `help`, etc.). |
| **`channels`** | **Standard Utility.** Basic channel management commands. |
| **`rolementions`**| **Standard Utility.** Control over role notifications. |
| **`nick`** | **Standard Utility.** A basic staff utility for managing user nicknames. |
| **`status`** | **Standard Utility.** Owner command to change the bot's presence. |

---

## Tier 3: External Modules (Installable via Downloader)

These modules serve niche use cases, "fun" commands, or highly specific community needs. Making them optional keeps the core bot lean and focused. They are not bundled with the bot and can be installed by a server administrator on-demand.

| Module | Justification |
| :--- | :--- |
| **`economy`** | **Niche Fun.** A server-wide currency system is a massive, opt-in feature that dramatically changes server dynamics. |
| **`leveling`** | **Niche Community.** XP and leveling systems are complex and not desired by all communities. Perfect for optional installation. |
| **`giveaways`** | **Niche Community.** A full-featured giveaway system is complex and not needed by every community. |
| **`customcom`** | **Niche Power-User.** Creating custom commands is a complex feature that most servers don't need. |
| **`suggestions`** | **Niche Utility.** A formal suggestion system is great but can be replaced by a simple forum channel, making it a good optional module. |
| **`booster_roles`**| **Niche Community.** Managing custom roles for server boosters is only relevant to communities with a high level of boosting. |
| **`birthday`** | **Niche Community.** A "fun" feature that adds personality but is not core to server management. |
| **`games`** | **Niche Fun.** A collection of simple games like Tic-Tac-Toe. Purely for fun and a classic example of an optional module. |
| **`music`** | **Highly Niche/Complex.** Due to high maintenance and legal complexities, music features should be external if offered at all. |
| **`ai_integrations`**| **Niche Power-User.** Integrating with external AI APIs is highly specialized and has cost/security implications. |
| **`emoji_stealer`**| **Niche Fun.** A classic "fun" command that can be disruptive or undesirable in many professional servers. |
| **`dragme`** | **Niche Voice.** Moves a user to the command-issuer's voice channel. A minor convenience, not a major feature. |
| **`multi_lounge`**| **Niche Voice.** A more advanced form of `tempvc`, creating persistent "waiting room" style lounges. Its specificity makes it ideal as an add-on. |
| **`feedback`** | **Niche Utility.** While useful, a dedicated feedback submission system can often be handled by a simple webhook or forum channel. |
| **`cleanup`** | **Niche Utility.** Bot message self-cleanup is a minor quality-of-life feature, not an essential service. |

---

## RabbitMQ Architecture Integration

RabbitMQ carries exactly two things today; the general-purpose fire-and-forget job
queue (`registerJobHandler`/`enqueueJob` + the delayed-queue/DLX) was removed because
nothing used it.

-   **Fanout events** — cross-process broadcasts (`ember.events`), so peer processes/shards can react to each other.
-   **RPC bridge** — request/response between the bot and the web dashboard (`ember.rpc.requests`), gated by `isDashboardEnabled`.

Background work is handled without a Rabbit job queue:

-   **Time-based / durable jobs** → **BullMQ** scheduled tasks (Redis DB 1). Delayed, exact-time, or repeated jobs that survive restarts. Overdue-after-downtime behaviour is governed per task by the `catchUp` policy (see `src/core/lib/scheduled-tasks.ts`).
-   **CPU-bound work** → **`WorkerManager`** worker threads, called directly by the feature that needs them (e.g. `FilterService`). No broker hop.

### Future: candidates for a dedicated worker service

These modules don't exist yet. If/when they do, slow or resource-intensive work
would justify reintroducing a durable work queue (or, per the roadmap, the
Redis Streams event bus) — not the deleted in-process Rabbit queue.

| Module | Use Case & Justification |
| :--- | :--- |
| **`ai_integrations`** | **Heavy Processing.** Publish a `generate_image` job; a dedicated worker performs the slow external API call and publishes the result back, so the main process never blocks. |
| **`music`** | **Heavy Processing & External APIs.** Track download, transcoding, and streaming run on a dedicated music worker, keeping the main process free. |
| **`economy`** | **Complex & Auditable Transactions.** A `transaction_worker` processes multi-step transactions reliably and in order, logging each step. |
| **`leveling`** (Analytics) | **Data Aggregation.** Offload slow report aggregation (e.g. 30-day activity heatmaps) to a worker. |
| **`reports`** / **`giveaways`** | **Guaranteed Delivery / Reliable Selection.** Durable queueing for at-least-once delivery and slow winner-selection queries. |
