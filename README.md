<div align="center">
  <img src="assets/banner.png" alt="Lumi" width="800">
</div>

---

Lumi v2 is a self-hosted Discord bot for communities that want full control over their server features.

It runs as a single process with a Discord gateway, embedded RPC bridge, and an in-process scheduler. Every feature family is a toggleable module. There is no hardcoded core and no privileged module you cannot turn off.

**For agents:** check `AGENTS.md` and the `agents/` directory, and [SETUP.md](SETUP.md) for platform instructions.

---

## What's inside

- **Supermodules**: Turn entire feature families on or off per server. Leveling, economy, moderation, logging, security, and utility are all manageable from the in-server panel.
- **Permit system**: Grant or deny access by permission node. Built-in permits are locked so they can't be reordered or deleted.
- **Voice XP**: XP only while a member is actually audible. Muted, deafened, suppressed, bot, or solo channel time earns nothing.
- **Channel and role filters**: Ignore lists with optional whitelists that override ignores.
- **Metrics**: Built-in Prometheus metrics and health endpoints.

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
git clone https://github.com/lumi-devs/Lumi.git
cd Lumi
nix develop
cp .env.example .env
# add DISCORD_TOKEN, OWNER_IDS, DATABASE_URL, REDIS_URL
bunx prisma migrate deploy
bunx prisma generate
bun run dev:bot
```

Full platform instructions are in [SETUP.md](SETUP.md).

---

Run `/lumi` in your server to open the module management panel: that's your total view of what's enabled, what's configurable, and what needs attention.

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