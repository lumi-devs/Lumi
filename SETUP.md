# Lumi v2 Setup

Lumi is a single-process Discord bot (gateway + RPC + scheduler) on Bun, PostgreSQL 18+, and Redis 8+.

## Before you start

- Discord Bot Application → [Developer Portal](https://discord.com/developers/applications)
  - Copy the bot token
  - Enable privileged intents: Server Members, Message Content, Presence
  - OAuth2 → URL Generator → scopes: `bot`, `applications.commands`
- PostgreSQL 18+ database
- Redis 8+

## Docker (recommended)

```bash
mkdir lumi && cd lumi
docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
docker compose up -d postgres redis
# Apply migrations before the bot starts (bunx prisma migrate deploy against the
# compose database, or the setup image). The bot process never migrates itself.
docker compose up -d
docker logs -f lumi-bot
```

This creates `.env` and `compose.yml`, then starts Postgres, Redis, and the bot.
Set `REDIS_PASSWORD` in `.env` before starting: both Redis and the bot read it.

## Nix / local

```bash
git clone https://github.com/lumi-devs/Lumi.git
cd Lumi
nix develop
cp .env.example .env
# fill in BOT_TOKEN, OWNER_IDS, DATABASE_URL, REDIS_URL
bunx prisma migrate deploy
bunx prisma generate
bun run dev:bot
```

## Ubuntu / Debian

```bash
curl -fsSL https://bun.sh/install | bash
sudo apt install -y postgresql-18 redis-server libpq-dev build-essential \
  python3 pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev \
  librsvg2-dev libpixman-1-dev

sudo -u postgres psql <<'SQL'
CREATE USER lumi WITH PASSWORD 'lumi';
CREATE DATABASE lumi OWNER lumi;
GRANT ALL PRIVILEGES ON DATABASE lumi TO lumi;
SQL

git clone https://github.com/lumi-devs/Lumi.git
cd Lumi
cp .env.example .env
# edit .env
bunx prisma migrate deploy && bunx prisma generate
bun run dev:bot
```

Systemd unit example:

```ini
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

[Install]
WantedBy=multi-user.target
```

## Arch Linux

```bash
yay -S bun
sudo pacman -S postgresql redis cairo pango libjpeg-turbo giflib librsvg pixman
sudo -u postgres initdb -D /var/lib/postgres/data
sudo systemctl enable --now postgresql redis
# create lumi user/database in postgres, then clone and run as above
```

## Windows

Use WSL2 + Docker (the Docker steps above). Native Windows Redis is not production-ready; if you must, use Memurai or run Postgres/Redis through WSL2.

## Environment variables

```env
BOT_TOKEN=your_bot_token
OWNER_IDS=123456789012345678
DATABASE_URL="postgresql://lumi:lumi@localhost:5432/lumi"
REDIS_URL="redis://localhost:6379"
GIT_TOKEN=ghp_xxx        # optional, for private addon repos
LOG_LEVEL=info
```

## Verify

```bash
docker logs lumi-bot | grep "Lumi v2 is ready"
curl localhost:9090/metrics
```

Slash commands should appear in your guild after inviting the bot with the `applications.commands` scope.