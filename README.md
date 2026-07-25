<div align="center">
  <br />
  <img src="assets/banner.png" alt="Lumi Mascot Banner" width="800" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
  <br />
  
  <h1>✨ Lumi</h1>
  
  <p><b>Your Modern, Modular, and Magical Discord Companion</b></p>

  <div align="center">
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.1+-black?style=for-the-badge&logo=bun" alt="Bun"></a>
    <a href="https://sapphirejs.dev"><img src="https://img.shields.io/badge/Sapphire-v5-blue?style=for-the-badge" alt="Sapphire"></a>
    <a href="https://discord.js.org"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js"></a>
    <img src="https://img.shields.io/badge/License-AGPL%20v3.0-green?style=for-the-badge" alt="License">
  </div>
  <br />
</div>

<details open>
  <summary><b>📖 Table of Contents</b></summary>
  <ol>
    <li><a href="#-introduction">Introduction</a></li>
    <li><a href="#-key-features">Key Features</a></li>
    <li><a href="#-core-modules--addons">Core Modules & Addons</a></li>
    <li><a href="#-getting-started">Getting Started</a></li>
    <li><a href="#-architecture--development">Architecture & Development</a></li>
    <li><a href="#-faq--support">FAQ & Support</a></li>
    <li><a href="#-license--trademark">License & Trademark</a></li>
  </ol>
</details>

---

## 🌟 Introduction

Lumi is a **powerful**, **highly scalable**, and **fully modular** Discord bot built for communities of all sizes. Inspired by the flexibility of bots like Red-DiscordBot, Lumi allows server administrators to enable *only* the features they need. It can transform from a simple utility bot into a complex moderation powerhouse, an economy game, or whatever your server requires.

Built on top of modern web technologies—**Bun**, **Sapphire Framework**, and **Discord.js**—Lumi is engineered for maximum performance, whether you're hosting it for a single server or scaling it across a massive distributed infrastructure.

---

## ✨ Key Features

- **🧩 Fully Modular Architecture**  
  Built around dynamic modules. Enable or disable entire feature sets per-guild. Don't want the levelling system? Simply turn it off.

- **📈 Enterprise-Grade Scalability**  
  Start simple with a monolith deployment, or scale out to millions of users by splitting Lumi into separate `Gateway`, `Worker`, and `Scheduler` processes using RabbitMQ and BullMQ.

- **🔌 Dynamic Addon System**  
  Easily install and run third-party modules dynamically via the downloader service. Extend Lumi to do anything you can code!

- **🗣️ Internationalization (i18n)**  
  Fully translated into multiple languages (`en-US`, `de`, `es-ES`, `fr`) out of the box, with per-server language selection.

- **🛡️ Built-in Moderation & Safety**  
  Powerful moderation tools, regex-based message filtering, and detailed audit logging keep your community safe.

- **📊 Deep Observability**  
  OpenTelemetry integration with Prometheus and Grafana dashboards ready for production monitoring.

---

## ⚡ Core Modules & Addons

Lumi comes with a rich set of built-in modules. Explore what's available out of the box:

<details>
<summary><b>⚙️ Core System</b></summary>
<br>

Manage the bot's foundational settings, configure modules, and set permissions.

> **Key Commands:**
> <code>/lumi</code> &nbsp;&middot;&nbsp; <code>/module</code> &nbsp;&middot;&nbsp; <code>/permissions</code> &nbsp;&middot;&nbsp; <code>/prefix</code>

</details>

<details>
<summary><b>🔨 Moderation</b></summary>
<br>

Keep your server safe with an advanced suite of moderation tools, including timed mutes, bans, kicks, and quarantine zones.

> **Key Commands:**
> <code>/ban</code> &nbsp;&middot;&nbsp; <code>/kick</code> &nbsp;&middot;&nbsp; <code>/timeout</code> &nbsp;&middot;&nbsp; <code>/warn</code> &nbsp;&middot;&nbsp; <code>/quarantine</code>

</details>

<details>
<summary><b>🛡️ Auto-Filter</b></summary>
<br>

Powerful automated, regex-based message filtering that stops spam, invites, and bad words before they hit the chat.

> **Configuration:**
> Fully managed via the interactive <code>/lumi panel</code>

</details>

<details>
<summary><b>🔧 Utility Tools</b></summary>
<br>

Helpful tools for everyday server management, checking user stats, server metrics, and handling away-from-keyboard (AFK) statuses.

> **Key Commands:**
> <code>/serverinfo</code> &nbsp;&middot;&nbsp; <code>/whois</code> &nbsp;&middot;&nbsp; <code>/afk</code>

</details>

<br>

> *Note: Use the `/help` command in Discord for a complete, up-to-date list of commands tailored to your server's currently enabled modules.*

---

## 🚀 Getting Started

Lumi is designed to be self-hosted. You retain full control over your data, your configuration, and your community.

> [!TIP]
> **New to self-hosting?** Docker is the recommended way to run Lumi as it bundles the bot, Postgres, Redis, and RabbitMQ seamlessly.

### 🐳 Method 1: Docker Compose (Recommended)

The easiest way to get up and running:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lumi-devs/lumi.git && cd lumi
   ```
2. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```
3. **Edit `.env`** to include your `BOT_TOKEN` and `CLIENT_ID`.
4. **Start the stack:**
   ```bash
   docker compose up -d
   ```

### 💻 Method 2: Bare Metal

For developers or advanced users who prefer a direct deployment. Requires [Bun 1.1+](https://bun.sh), PostgreSQL 16, and Redis 7.

```bash
# 1. Install dependencies
bun install

# 2. Push database schema
bun run db:generate
bun run db:push

# 3. Start the bot
bun run dev
```

---

## 🏗️ Architecture & Development

Lumi operates as a Bun-workspace monorepo, separating core logic from infrastructure:

- **`@lumi/core`**: The brain of the bot (Commands, Modules, Services).
- **`@lumi/event-bus`**: Pluggable transport layer (`inproc`, Redis Streams, or NATS).
- **`@lumi/observability`**: Telemetry, tracing, and metrics (Prometheus & Grafana ready).
- **`@lumi/sharding`**: Cluster coordinator and shard planner.
- **`@lumi/contracts`**: Shared interfaces and types across the monorepo.
- **`@lumi/sdk`**: Developer SDK for interacting with Lumi services.

### 🔄 Runtime Roles
You can run Lumi as a `monolith` (default), or scale horizontally by setting the `LUMI_ROLE` environment variable:
- **`gateway`**: Holds the Discord WebSocket, publishes raw events onto the bus.
- **`worker`**: Runs all command and module logic (no WebSocket of its own).
- **`scheduler`**: Owns the BullMQ queue for delayed and repeated jobs.

> For developers looking to contribute or create addons, please read our comprehensive [Architecture Guidelines (AGENTS.md)](AGENTS.md).

---

## ❓ FAQ & Support

<details>
<summary><b>Do third-party addons run in a sandbox?</b></summary>
<br>

> [!WARNING]
> No. Third-party addons executed by Lumi have **NO strict sandboxing**. They run with the same privileges as the bot process (access to token, database, and filesystem). **Only install addons from sources you trust completely.**

</details>

<details>
<summary><b>I found a bug! Where can I report it?</b></summary>
<br>

Please open an issue on our [GitHub Issues](https://github.com/lumi-devs/lumi/issues) page. Provide as much detail as possible, including logs and reproduction steps.

</details>

---

## ⚖️ License & Trademark

Lumi is licensed under the **GNU AGPL v3.0 License**. See the [LICENSE](LICENSE) file for more details. 

> [!IMPORTANT]
> **Trademark Notice**: The "Lumi" name, branding, and mascot are reserved. If you fork, modify, or host your own public instance of this bot, you **MUST** rename it and use your own branding so as not to impersonate the official Lumi bot or mislead users.

---

<div align="center">
  Made with ❤️ by the Lumi Project Contributors.<br>
  Please read the <a href="CONTRIBUTING.md">Contributing Guide</a> before making a pull request.
</div>
