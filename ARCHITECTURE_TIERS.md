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

While most bot features are lightweight responses to commands or events, some require slow or resource-intensive processing. For these, a message queue is the ideal architecture to offload work from the main bot process, ensuring continued responsiveness. RabbitMQ is a strategic component of this project, reserved for these specific use cases.

It is important to distinguish its role from the Redis-backed scheduler:
-   **Redis-based Scheduled Tasks**: Used for **time-based** jobs (e.g., "run this task every 15 minutes").
-   **RabbitMQ Message Queue**: Used for **event-based** jobs that need to be processed asynchronously by a separate worker service (e.g., "a user requested a report, generate it now").

The following modules are prime candidates for leveraging a RabbitMQ-based worker architecture.

### Prime Candidates for RabbitMQ

| Module | Use Case & Justification |
| :--- | :--- |
| **`ai_integrations`** | **Heavy Processing.** When a user prompts the bot for an AI task (e.g., image generation), the main bot would publish a `generate_image` job to a queue. A dedicated worker service would pick up the job, perform the slow API call to an external AI service, and publish the result back. This prevents the main bot from freezing while waiting for the AI API. |
| **`mydata`** (Export) | **Slow I/O & Database Load.** A GDPR data export must query every table in the database. For a user active across many servers, this is a slow operation. Offloading this to a "ReportGenerator" worker via RabbitMQ prevents the main bot from lagging and allows the worker to compile the data and deliver it when ready. |
| **`music`** | **Heavy Processing & External APIs.** Downloading tracks, transcoding them to the correct audio format, and streaming are all resource-intensive. The bot would publish a `play_track` job, and a dedicated music worker would handle the download, encoding, and voice connection, keeping the main process free. |
| **`economy`** | **Complex & Auditable Transactions.** For features like a virtual stock market or item trading, RabbitMQ can ensure complex, multi-step transactions are processed reliably and in order. A `transaction_worker` can process a queue, ensuring each step is completed and logged before moving to the next. |
| **`leveling`** (Analytics) | **Data Aggregation & Analysis.** If the leveling system includes generating detailed analytics reports (e.g., "activity heatmap for the last 30 days"), this slow data aggregation is a perfect job to offload to a worker. |

### Possible Candidates (for Enhanced Resilience)

| Module | Use Case & Justification |
| :--- | :--- |
| **`reports`** (and other logging)| **Guaranteed Delivery.** For maximum resilience, the bot could publish reports to a durable RabbitMQ queue instead of writing directly to the database. A `database_writer` worker would then pull from this queue, retrying if the database is momentarily down. |
| **`giveaways`** | **Reliable Winner Selection.** For a large giveaway, the "end giveaway" task could be published as a job. A worker then fetches all entrants, performs the random selection, and announces the winner, ensuring a potentially slow query doesn't block the main bot. |
