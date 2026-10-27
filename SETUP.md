# Lumi v2 — Setup & Deployment Guide

Lumi is a single-process Discord bot (gateway + RPC + scheduler) that runs on **Bun**, **PostgreSQL 18+**, and **Redis 8+**. This guide covers every supported platform.

---

## Quick Reference

| Platform | Method | Difficulty |
|----------|--------|------------|
| **Docker (any Linux/macOS/Windows)** | `docker compose` | ⭐ Easiest |
| **NixOS / Nix (flakes)** | `nix develop` + Bun | ⭐⭐ Recommended for devs |
| **Ubuntu / Debian** | Native Bun + systemd | ⭐⭐ |
| **Arch Linux** | AUR `bun` + systemd | ⭐⭐ |
| **Windows** | Native Bun + NSSM / Task Scheduler | ⭐⭐⭐ |
| **Manual (any)** | Bun binary + PM2 / systemd | ⭐⭐⭐ |

> **TL;DR**: Use **Docker** for production, **Nix** for development. Both give you Postgres + Redis automatically.

---

## Prerequisites (All Platforms)

1. **Discord Bot Application** → [Developer Portal](https://discord.com/developers/applications)
   - Create application → Bot tab → **Copy Token**
   - Enable **Privileged Gateway Intents**:
     - ✅ Server Members (`GUILD_MEMBERS`)
     - ✅ Message Content (`MESSAGE_CONTENT`)
     - ✅ Presence (`GUILD_PRESENCES`)
   - OAuth2 → URL Generator → Scopes: `bot` + `applications.commands` → Copy invite URL

2. **PostgreSQL 18+** — Database for config, economy, leveling, permits, logs
3. **Redis 8+** — Cache, locks, BullMQ queues, pub/sub invalidation

---

## Option 1: Docker (Recommended for Production)

### 1. Generate config + compose file

```bash
mkdir lumi && cd lumi
docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
```

This creates:
- `.env` — pre-filled with your answers (token, owner IDs, DB/Redis URLs)
- `compose.yml` — Postgres, Redis, and bot services

### 2. Start the stack

```bash
docker compose up -d
docker logs -f lumi-bot
```

### 3. Verify

- Bot logs: `docker logs lumi-bot | grep "Lumi v2 is ready"`
- Health check: `curl localhost:9090/metrics` (Prometheus)
- Invite bot using the OAuth2 URL printed on startup

### 4. Update

```bash
docker compose pull && docker compose up -d
```

### Docker compose.yml (reference)

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: lumi
      POSTGRES_USER: lumi
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lumi"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  bot:
    image: ghcr.io/lumi-devs/lumi:latest
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "8091:8091"   # RPC (optional, for dashboard)
      - "9090:9090"   # Prometheus metrics
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

## Option 2: NixOS / Nix Flakes (Recommended for Development)

### 1. Enter dev shell (installs Bun, Node, Postgres, Redis, canvas deps, libuuid)

```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
nix develop
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values:
# DISCORD_TOKEN=...
# OWNER_IDS=123456789012345678
# DATABASE_URL="postgresql://lumi:lumi@localhost:5432/lumi"
# REDIS_URL="redis://localhost:6379"
```

### 3. Start Postgres + Redis (via Nix services or Docker)

**Option A: NixOS services** (add to `configuration.nix`):
```nix
services.postgresql = {
  enable = true;
  package = pkgs.postgresql_18;
  authentication = "local password";
  ensureDatabases = [ "lumi" ];
  ensureUsers = [
    { name = "lumi"; ensurePermissions = { "DATABASE" = "ALL PRIVILEGES"; }; }
  ];
};

services.redis = {
  enable = true;
  package = pkgs.redis_8;
  settings = { appendonly = "yes"; };
};
```
Then `sudo nixos-rebuild switch`.

**Option B: Docker just for DB** (simpler):
```bash
docker run -d --name lumi-postgres -e POSTGRES_DB=lumi -e POSTGRES_USER=lumi -e POSTGRES_PASSWORD=lumi -p 5432:5432 postgres:18-alpine
docker run -d --name lumi-redis -p 6379:6379 redis:8-alpine redis-server --appendonly yes
```

### 4. Database setup

```bash
bunx prisma migrate deploy
bunx prisma generate
```

### 5. Run the bot

```bash
bun run typecheck && bun run test
bun run dev:bot
```

### 6. Systemd service (NixOS)

```nix
# /etc/nixos/lumi-bot.nix
{ config, pkgs, ... }:
let
  lumi = pkgs.callPackage ./Lumi { };
in
{
  systemd.services.lumi-bot = {
    description = "Lumi Discord Bot";
    after = [ "postgresql.service" "redis.service" "network-online.target" ];
    wants = [ "postgresql.service" "redis.service" ];
    serviceConfig = {
      Type = "simple";
      User = "lumi";
      WorkingDirectory = "/home/lumi/Lumi";
      EnvironmentFile = "/home/lumi/Lumi/.env";
      ExecStart = "${pkgs.bun}/bin/bun run src/index.ts";
      Restart = "on-failure";
      RestartSec = 5;
    };
    wantedBy = [ "multi-user.target" ];
  };
}
```

---

## Option 3: Ubuntu / Debian (Native)

### 1. Install dependencies

```bash
# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PostgreSQL 18
sudo apt update && sudo apt install -y postgresql-18 postgresql-client-18 libpq-dev

# Redis 8
sudo apt install -y redis-server
sudo systemctl enable --now redis-server

# Build tools for canvas
sudo apt install -y build-essential python3 pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev
```

### 2. Configure Postgres

```bash
sudo -u postgres psql <<'SQL'
CREATE USER lumi WITH PASSWORD 'lumi';
CREATE DATABASE lumi OWNER lumi;
GRANT ALL PRIVILEGES ON DATABASE lumi TO lumi;
SQL
```

### 3. Configure Redis

```bash
# /etc/redis/redis.conf — ensure appendonly yes
sudo sed -i 's/^# appendonly no/appendonly yes/' /etc/redis/redis.conf
sudo systemctl restart redis-server
```

### 4. Clone & configure

```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
cp .env.example .env
# Fill in .env
```

### 5. Database & run

```bash
bunx prisma migrate deploy && bunx prisma generate
bun run typecheck && bun run test
bun run dev:bot
```

### 6. Systemd service

```ini
# /etc/systemd/system/lumi-bot.service
[Unit]
Description=Lumi Discord Bot
After=network-online.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=lumi
WorkingDirectory=/home/lumi/Lumi
EnvironmentFile=/home/lumi/Lumi/.env
ExecStart=/home/lumi/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lumi-bot
sudo journalctl -u lumi-bot -f
```

---

## Option 4: Arch Linux

### 1. Install

```bash
# Bun (AUR)
yay -S bun

# PostgreSQL
sudo pacman -S postgresql
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl enable --now postgresql

# Redis
sudo pacman -S redis
sudo systemctl enable --now redis

# Canvas deps
sudo pacman -S cairo pango libjpeg-turbo giflib librsvg pixman
```

### 2. Configure Postgres + Redis (same as Ubuntu)

### 3. Clone, configure, run (same as Ubuntu)

### 4. Systemd (same as Ubuntu, adjust ExecStart path to `/usr/bin/bun`)

---

## Option 5: Windows

### 1. Install Bun

```powershell
# PowerShell (Admin)
irm bun.sh/install.ps1 | iex
# Restart terminal
```

### 2. Install PostgreSQL + Redis

**PostgreSQL:** Download installer from [postgresql.org](https://www.postgresql.org/download/windows/) → Run → Remember password

**Redis:** Use [Memurai](https://www.memurai.com/) (Redis-compatible, free dev license) or WSL2 + Docker.

> **Recommendation**: Use **WSL2 + Docker** (Option 1) on Windows. Native Redis on Windows is not production-ready.

### 3. Configure Postgres

```powershell
# In psql shell or pgAdmin
CREATE USER lumi WITH PASSWORD 'lumi';
CREATE DATABASE lumi OWNER lumi;
GRANT ALL PRIVILEGES ON DATABASE lumi TO lumi;
```

### 4. Clone & configure

```powershell
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
Copy-Item .env.example .env
notepad .env
```

### 5. Database & run

```powershell
bunx prisma migrate deploy
bunx prisma generate
bun run typecheck
bun run test
bun run dev:bot
```

### 6. Run as Service (NSSM)

```powershell
# Download NSSM from https://nssm.cc/download
# Extract, then:
nssm install LumiBot
# Path: C:\Users\<you>\.bun\bin\bun.exe
# Arguments: run src/index.ts
# Startup directory: C:\path\to\Lumi
# Environment: load from .env (NSSM doesn't support .env directly; set each var in Registry or use a wrapper script)
```

> **Better**: Use **PM2** (`npm i -g pm2`) or **WSL2 + Docker**.

---

## Environment Variables (.env)

```env
# Required
DISCORD_TOKEN=your_bot_token_here
OWNER_IDS=123456789012345678,987654321098765432

# Database
DATABASE_URL="postgresql://lumi:lumi@localhost:5432/lumi?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Optional
GIT_TOKEN=ghp_xxx                    # For private addon repos
LOG_LEVEL=info                       # debug, info, warn, error
METRICS_PORT=9090                    # Prometheus metrics
RPC_PORT=8091                        # RPC bridge (dashboard)
```

---

## Post-Install Verification

1. **Bot online**: Check Discord — bot shows green status
2. **Slash commands**: Type `/` in server — should show `/lumi`, `/rank`, `/leaderboard`, `/ping`, `/about`, `/panic`, `/permit`
3. **Panel**: Run `/lumi` → Modules → Enable "Community" → Leveling → Voice XP
4. **Metrics**: `curl http://localhost:9090/metrics` → Should show `lumi_` prefixed metrics
5. **RPC**: `curl http://localhost:8091/health` → `{"status":"ok"}`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Canvas` / `libuuid` errors | Nix: `util-linux` in `flake.nix`; Ubuntu: `apt install libuuid-dev`; Arch: `pacman -S util-linux` |
| Prisma migration fails | Ensure Postgres 18+, run `bunx prisma migrate deploy` |
| Redis connection refused | Check `redis-cli ping` → `PONG`; check firewall/bind address |
| Slash commands not showing | Kick/re-invite bot with `applications.commands` scope; check `/lumi` → Modules → enabled |
| Voice XP not working | `/lumi` → Community → Leveling → Voice XP Enabled = On; ensure bot has `Connect` + `Speak` perms in VC |
| Fontconfig warnings | Harmless; install `fontconfig` + `noto-fonts` for cleaner logs |

---

## Useful Commands

```bash
# Development
bun run typecheck      # TypeScript check
bun run lint           # Biome lint
bun run test           # Vitest (141+ tests)
bun run build          # Bundle to dist/

# Database
bunx prisma studio     # Visual DB browser
bunx prisma migrate dev # Create new migration
bunx prisma db seed    # Run seed (if defined)

# Logs
docker logs -f lumi-bot
journalctl -u lumi-bot -f
```

---

## Links

- **Documentation**: https://lumi-devs.github.io/Lumi-docs
- **Issues**: https://github.com/lumi-devs/Lumi/issues
- **Discord**: (invite link here)
- **Docker Hub**: https://hub.docker.com/r/lumidevs/lumi