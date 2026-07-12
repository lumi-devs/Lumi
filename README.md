<div align="center">
  <br>
  <!-- Embed the generated image here -->
  <img src="lumi_mascot_banner.png" alt="Lumi Mascot Banner" width="800">
  <br>
  <h1>Lumi</h1>
  <p><b>✨ Your Modern, Modular, and Magical Discord Companion ✨</b></p>

  <p>
    <img src="https://img.shields.io/badge/Bun-1.1+-black?style=for-the-badge&logo=bun" alt="Bun">
    <img src="https://img.shields.io/badge/Sapphire-v5-blue?style=for-the-badge" alt="Sapphire">
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js">
    <img src="https://img.shields.io/badge/License-AGPL%20v3.0-green?style=for-the-badge" alt="License">
  </p>
</div>

---

## 🌟 What does it do?

Lumi is a powerful, highly scalable, and modular Discord bot built for communities that need flexibility. 

- **🧩 Truly Modular**: Enable or disable features per-server. Don't need the economy module? Turn it off.
- **📈 Built to Scale**: Run it as a monolith out of the box, or split it into separate Gateway, Worker, and Scheduler processes powered by RabbitMQ and BullMQ.
- **🔌 Third-Party Addons**: A powerful downloader service allows you to install and run third-party modules dynamically.
- **🗣️ Internationalization**: Fully translated into multiple languages (en-US, de, es-ES, fr).

---

## ⚡ Core Features & Commands

| Category | Description | Key Commands |
|----------|-------------|--------------|
| **⚙️ Admin & Core** | Manage the bot, modules, and permissions. | `/lumi`, `/module`, `/permissions`, `/prefix` |
| **🔨 Moderation** | Keep your server safe with advanced moderation. | `/ban`, `/kick`, `/timeout`, `/warn`, `/quarantine` |
| **🛡️ Auto-Filter** | Powerful regex-based message filtering. | `Configured via /lumi panel` |
| **🔧 Utility** | Helpful tools for everyday server management. | `/serverinfo`, `/whois`, `/afk` |

> *Note: This is just a glimpse! Use `/help` in Discord for a full, up-to-date list of commands.*

---

## 🚀 How do I install this?

> [!TIP]
> **New to self-hosting?** Docker is the recommended way to run Lumi as it bundles everything you need!

### Method 1: Docker (Recommended)

A bare `docker compose up` starts the monolith — the bot plus Postgres, PgBouncer, Redis, and RabbitMQ — on one host:

```bash
cp .env.example .env        # Make sure to set BOT_TOKEN and CLIENT_ID
docker compose up -d
```

### Method 2: Bare Metal

Requires [Bun 1.1+](https://bun.sh), PostgreSQL 16, and Redis 7 running locally.

```bash
bun install
bun run db:generate
bun run db:push
bun run dev
```

---

## 🏗️ Architecture Stack

Lumi operates as a Bun-workspace monorepo with dedicated packages:

*   **`@lumi/core`**: The brain of the bot (Commands, Modules, Services).
*   **`@lumi/event-bus`**: Pluggable transport (In-process, Redis Streams, or NATS).
*   **`@lumi/observability`**: Telemetry, tracing, and metrics (Prometheus & Grafana ready).
*   **`@lumi/sharding`**: Cluster coordinator and shard planner.

### Runtime Roles
You can run Lumi as a `monolith` (default), or scale horizontally by setting `LUMI_ROLE` to:
*   `gateway`: Holds the Discord WebSocket, publishes raw events onto the bus.
*   `worker`: Runs all command and module logic (no WebSocket of its own).
*   `scheduler`: Owns the BullMQ queue for delayed and repeated jobs.
*   `dashboard`: Dashboard RPC bridge.

---

## ❓ FAQ

**Q: Do third-party addons run in a sandbox?**
> [!WARNING]
> No. Third-party addons executed by Lumi have NO strict sandboxing. They run with the same privileges as the bot process (access to token, database, and filesystem). **Only install addons from sources you trust completely.**

**Q: Where can I find the architecture guidelines?**
Check out [AGENTS.md](AGENTS.md) for a comprehensive overview of how Lumi is structured, the module system, conventions, and things NOT to do.

---

## ⚖️ License & Trademark

Lumi is licensed under the **GNU AGPL v3.0 License**. See the [LICENSE](LICENSE) file for more details. 

> [!IMPORTANT]
> **Trademark Notice**: The "Lumi" name, branding, and mascot are reserved. If you fork, modify, or host your own public instance of this bot, you **MUST** rename it and use your own branding so as not to impersonate the official Lumi bot or mislead users.
