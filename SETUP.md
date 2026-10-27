# Lumi v2 — Setup & Operations Guide

## Quick Start

### Prerequisites
- **Node.js/Bun** — Bun v1.1+ (recommended) or Node.js 20+
- **PostgreSQL** — 15+
- **Redis** — 7+
- **Discord Bot Token** — From [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

```bash
# Clone and enter
git clone https://github.com/your-org/lumi-v2
cd lumi-v2

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your tokens and database URLs

# Generate Prisma client
bun run db:generate

# Run migrations
bun run db:migrate

# Start the bot
bun run dev:bot
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | Redis host (default: localhost) |
| `REDIS_PORT` | | Redis port (default: 6379) |
| `REDIS_PASSWORD` | | Redis password if needed |
| `OWNER_IDS` | | Comma-separated Discord user IDs for bot owner commands |
| `RPC_HTTP_PORT` | | Control server port (default: 8091) |
| `RPC_INTERNAL_TOKEN` | | Bearer token for control server endpoints |
| `METRICS_PORT` | | Prometheus metrics port (default: 9090) |

---

## Managing the Bot

### Discord Commands

#### Core Commands (Always Available)
| Command | Description |
|---------|-------------|
| `/lumi` | Main control panel |
| `/module` | Enable/disable/list modules |
| `/config` | Get/set/reset config values |
| `/permit` | Manage permissions |
| `/ping` | Check latency |

#### Module Commands (Require Module Enabled)
| Module | Commands |
|--------|----------|
| `mod` | `/ban`, `/kick`, `/timeout`, `/warn`, `/purge`, `/unban`, `/unmute`, `/note`, `/case`, `/lockdown` |
| `leveling` | `/rank`, `/leaderboard`, `/levelset` |
| `economy` | `/balance`, `/daily`, `/weekly`, `/work`, `/pay`, `/deposit`, `/withdraw`, `/baltop` |
| `filter` | `/filter` (configure auto-mod) |
| `utility` | `/avatar`, `/banner`, `/whois`, `/serverinfo`, `/nick`, `/roleinfo`, `/channelinfo`, `/emojiinfo` |
| `tempvc` | `/tempvc` (create, delete, claim, transfer, rename, limit, lock) |
| `logging` | Configured via panel |
| `welcome` | Configured via panel |
| `reactionroles` | Configured via panel |
| `afk` | `/afk`, `/unafk` |
| `onboarding` | Configured via panel |
| `sticky` | Configured via panel |
| `sheets` | Configured via panel |

### Module Management

#### Enable a Module
```
/module enable name:mod
```

#### Disable a Module
```
/module disable name:mod
```

#### List All Modules
```
/module list
```

#### Reload a Module (After Config Changes)
```
/module reload name:mod
```

#### Module Configuration
```
/config get key:mod.xpPerMessage
/config set key:mod.xpPerMessage value:20
/config reset key:mod.xpPerMessage
```

### Permission System

Lumi uses a **permit system** for granular permissions:

#### Permit Nodes
- `mod.ban` — Ban members
- `mod.kick` — Kick members
- `mod.timeout` — Timeout members
- `mod.warn` — Warn members
- `mod.purge` — Purge messages
- `admin.*` — All admin commands
- `mod.*` — All moderation commands

#### Grant a Permit
```
/permit grant user:@user permit:mod.ban
/permit grant role:@mods permit:mod.*
```

#### View Permissions
```
/permit explain node:mod.ban user:@user
```

#### Time-Based Permits
```
/permit grant user:@user permit:mod.ban expires-in:24h
```

---

## Maintenance

### Database

```bash
# Generate Prisma client after schema changes
bun run db:generate

# Create and run migration
bun run db:migrate

# Open Prisma Studio (GUI)
bun run db:studio
```

### Updates

```bash
# Pull latest changes
git pull

# Install new dependencies
bun install

# Regenerate Prisma client
bun run db:generate

# Run pending migrations
bun run db:migrate

# Restart bot
# (Use your process manager: systemd, pm2, docker, etc.)
```

### Logs

```bash
# View bot logs (systemd)
journalctl -u lumi-bot -f

# View bot logs (pm2)
pm2 logs lumi-bot

# View bot logs (docker)
docker logs -f lumi-bot
```

### Health Checks

```bash
# Bot health
curl http://localhost:8080/health

# Prometheus metrics
curl http://localhost:9090/metrics

# RPC status
curl http://localhost:8080/status
```

### Add-on Management

Add-ons are managed from the panel by bot owners (`OWNER_IDS`).

1. `/lumi` → **Add-ons** → **Repositories** → **Add Repository**
2. Enter a lowercase repository name, an HTTPS git URL, and an optional branch
3. Open the repository and **Browse** its modules
4. **Install** a module, then enable and configure it from the Modules tab

Private repositories use a token:

```env
GIT_TOKEN=ghp_xxx
GIT_USERNAME=x-access-token   # optional
```

**Update** fetches the branch and reloads changed add-ons; a failed update rolls
back. **Auto-update** can be enabled with an interval between one hour and one
week. **Pin** excludes an add-on from updates.

---

## Configuration Reference

### Module Config Examples

#### Leveling
```json
{
  "xpPerMessage": 15,
  "cooldownSeconds": 60,
  "roleRewards": [
    {"level": 5, "roleId": "123...", "removePrevious": false},
    {"level": 10, "roleId": "456...", "removePrevious": true}
  ],
  "multiplierRoles": [
    {"roleId": "789...", "multiplier": 1.5}
  ],
  "ignoredChannels": ["123...", "456..."],
  "ignoredRoles": ["789..."]
}
```

#### Economy
```json
{
  "currencyName": "Credits",
  "currencySymbol": "💰",
  "startingBalance": 100,
  "dailyAmount": 100,
  "weeklyAmount": 500,
  "monthlyAmount": 2000,
  "interestRate": 0.01,
  "taxRate": 0.05,
  "workCooldown": 3600,
  "workMinPay": 50,
  "workMaxPay": 200,
  "shopItems": [
    {"id": "role_vip", "name": "VIP Role", "price": 5000, "type": "role", "roleId": "123..."}
  ]
}
```

#### Filter
```json
{
  "enabled": true,
  "rules": [
    {"id": "1", "name": "No invites", "pattern": "discord.gg", "type": "phrase", "action": "delete"},
    {"id": "2", "name": "No bad words", "pattern": "badword", "type": "word", "action": "warn"}
  ],
  "ignoredChannels": [],
  "ignoredRoles": [],
  "whitelist": ["discord.gg/lumi"]
}
```

#### TempVC
```json
{
  "categoryId": "123...",
  "templateName": "➕ {user}'s Channel",
  "defaultBitrate": 64000,
  "defaultUserLimit": 0,
  "maxChannels": 50,
  "maxPerUser": 1,
  "emptyTimeoutMs": 300000,
  "ownerLeaveDelete": true
}
```

---

## Troubleshooting

### Bot Won't Start

| Issue | Solution |
|-------|----------|
| `DISCORD_TOKEN not set` | Check `.env` file |
| `DATABASE_URL` invalid | Verify PostgreSQL is running and URL is correct |
| `Redis connection refused` | Check Redis is running and `REDIS_HOST`/`REDIS_PORT` |
| Prisma client missing | Run `bun run db:generate` |
| Migration failed | Check `bun run db:migrate` output, fix conflicts |

### Commands Not Working

| Issue | Solution |
|-------|----------|
| "Module not enabled" | Run `/module enable name:<module>` |
| "Missing permit" | Grant permit via `/permit grant` |
| "Unknown command" | Check `/module list`, reload module |
| Slash commands not showing | Wait up to 1 hour for Discord cache, or restart bot |

### Performance Issues

| Issue | Solution |
|-------|----------|
| High memory | Check cache sizes, reduce `l1MaxSize` |
| Slow commands | Check Redis latency, add indexes |
| High CPU | Check for runaway listeners, add cooldowns |

---

## Production Deployment

### Docker

```dockerfile
# Dockerfile
FROM oven/bun:1.1

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production

COPY . .
RUN bun run db:generate

CMD ["bun", "src/index.ts"]
```

```bash
# Build
docker build -t lumi-bot .

# Run
docker run -d \
  --name lumi-bot \
  --env-file .env \
  -p 8080:8080 \
  -p 9090:9090 \
  lumi-bot
```

### Systemd Service

```ini
# /etc/systemd/system/lumi-bot.service
[Unit]
Description=Lumi v2 Discord Bot
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=lumi
WorkingDirectory=/opt/lumi-v2
ExecStart=/usr/local/bin/bun src/index.ts
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/lumi-v2/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lumi-bot
```

### PM2

```bash
pm2 start src/index.ts --name lumi-bot --interpreter bun
pm2 save
pm2 startup
```

---

## Support

- **Issues**: GitHub Issues
- **Discord**: [Support Server](https://discord.gg/your-invite)
- **Documentation**: This guide + `agents/` folder for developers