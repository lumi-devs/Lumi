<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">
</div>

---

Lumi v2 is a self-hosted Discord bot built with Bun, TypeScript, PostgreSQL, and Redis.

It runs as a single process: one Discord gateway client, an embedded RPC bridge, and an in-process scheduler. Everything loads as toggleable modules — there's no hardcoded core and no privileged modules you can't turn off.

**Default branch:** `v2/develop`  
**Docs:** https://lumi-devs.github.io/Lumi-docs

---

## What's inside

- **Supermodules** — Community (leveling, economy), moderation, logging, security, and utility. Each can be enabled or disabled per server from `/lumi`.
- **Permit system** — Grant/Deny polarity with node-based permissions (e.g. `mod.ban`, `admin.config`). Built-in permits (Extra Owner, Trusted Admin) are locked from reordering.
- **Components V2 only** — No Discord embeds. All output is card-based, including server-generated rank card PNGs.
- **Voice XP** — Only grants XP while a member is audible. Mute, deaf, server-mute, suppress, bots, and single-occupant channels earn nothing.
- **Channel/role filters** — Ignore lists for channels and roles, with optional whitelists that override ignores.
- **Metrics** — Prometheus on `:9090`, health on `:8091`.

---

## Quick start

**Docker (recommended)**

```bash
mkdir lumi && cd lumi
docker run --rm -it -v .:/setup ghcr.io/lumi-devs/lumi:latest lumi-setup init /setup
docker compose up -d
```

**Nix / local**

```bash
git clone git@github.com:lumi-devs/Lumi.git
cd Lumi
nix develop
cp .env.example .env
# add DISCORD_TOKEN, OWNER_IDS, DATABASE_URL, REDIS_URL
bunx prisma migrate deploy
bunx prisma generate
bun run dev:bot
```

Full platform instructions (Docker, NixOS, Ubuntu, Debian, Arch, Windows, systemd) are in [SETUP.md](SETUP.md).

---

## Commands

| Command | Description |
|---------|-------------|
| `/lumi` | Module management panel |
| `/permit` | Permit management |
| `/rank` | Level card (image) |
| `/leaderboard` | XP or voice leaderboard |
| `/panic` / `/panic revert` | Security lockdown |
| `/ping` | Latency and gateway status |
| `/about` | Bot info |

Prefix commands work too — default is `,`, customizable per guild, or mention the bot.

---

## Contributing

```bash
bun run typecheck
bun run lint
bun run test
```

Tests must not hit Discord or require a real token.

---

## License

AGPL-3.0. See `LICENSE`.

---