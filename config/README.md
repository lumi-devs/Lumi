# Lumi Infrastructure & Application Configuration (`config/`)

<div align="center">
  <img src="https://img.shields.io/badge/Directory-Configuration-blue?style=for-the-badge" alt="Directory">
  <img src="https://img.shields.io/badge/Defaults-Merging-brightgreen?style=for-the-badge" alt="Defaults">
</div>

> Master configuration directory housing bot branding profiles, custom emojis, infrastructure settings, and Docker service configurations.

---

## 📦 Overview

The `config/` directory manages bot UI branding defaults and Docker infrastructure service settings. Both `bot.json` and `emojis.json` are optional — Lumi loads built-in defaults and merges any user-specified overrides on top.

---

## 📄 Application Configuration Files

### `bot.json`
Controls presence, embed color schemes, support links, permission tier names, and UI default settings:

- **`presence`**: `activityType` (0 Playing, 1 Streaming, 2 Listening, 3 Watching, 5 Competing), `activityText`, `status` (`online`, `idle`, `dnd`, `invisible`).
- **`branding.colors`**: Embed & card colors as decimal integers (e.g. `0x5865F2` = `5793266`).
- **`branding.links`**: `supportServer`, `website`, and `github` URLs surfaced in `/help` and `/about`.
- **`permissions.names`**: Display labels for permission tiers.
- **`ui.defaultListPerPage`**: Page size for paginated list cards.

### `emojis.json`
Overrides named emojis used in card headers and UI elements. Values can be unicode glyphs (`🟢`) or custom Discord emoji strings (`<:name:id>`). Unspecified keys fall back to unicode defaults.

---

## 🏗️ Infrastructure Service Directories

The sub-directories in `config/` host configuration templates for containerized infrastructure:
- `postgres/`: PostgreSQL initialization scripts and tuning configs.
- `redis/`: Redis persistence (`redis.conf`) and stream capping configuration.
- `rabbitmq/`: RabbitMQ definitions and exchange/queue binding configs.
- `observability/`: OpenTelemetry collector, Prometheus (`prometheus.yml`), and Grafana dashboard provisioning.
