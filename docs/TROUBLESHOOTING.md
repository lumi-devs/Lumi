# Troubleshooting

Find your symptom below. This covers what most people actually run into on a single-server setup - if you're running a bigger, multi-instance deployment, also check [Production Deployment](GUIDE_PRODUCTION_DEPLOYMENT.md) and [Architecture](architecture.md).

## The bot won't start, or won't fully come online

**It exits immediately after starting.** Almost always a bad or missing bot token. Check the logs, or run `bun run setup` again - it re-checks your token against Discord directly and tells you if something's wrong.

**It's running, but slash commands never show up.** The first time commands are registered globally, Discord can take up to an hour to roll them out everywhere. Test in one server while you wait - that usually shows up within a minute or two. Still nothing after an hour? Check the logs for a registration error.

**It can't reach the database.** Make sure Postgres and its connection pooler are both actually healthy (`docker compose ps` should show `healthy`, not just `running`), and double-check your database URL points at the pooler, not straight at Postgres.

**Commands work, but AFK / member-join features / prefix commands quietly do nothing.** This is almost always a missing intent. Go to your bot's settings on the [Developer Portal](https://discord.com/developers/applications), open the **Bot** tab, and make sure **Server Members Intent** and **Message Content Intent** are both turned on. There's no error when this is off - the events just never arrive. Restart the bot after flipping them.

## The dashboard

**Login fails or loops back to the login page.** The redirect URL registered on your Discord application doesn't match what the dashboard is actually running on. It needs to be exactly `https://<your-dashboard-address>/api/auth/callback/discord` - scheme, host, and port all have to match.

**Pages load but nothing has any data, or every page redirects.** The dashboard can't reach the bot. Confirm the bot is running and that the dashboard is pointed at the right address for it - see [FAQ § do I need the dashboard](FAQ.md#do-i-need-the-web-dashboard) if you're not sure it's worth chasing down.

**Every action in the dashboard fails.** The dashboard and the bot need to agree on a shared internal token. If you've only set one on one side, or they don't match, this is what happens - set the same value on both and restart.

**Cookies won't stick behind a reverse proxy.** This usually means the app thinks it's being served over plain HTTP when it's actually HTTPS (common if your proxy terminates TLS). Make sure the dashboard's configured URL uses `https://`.

## Addons

**`,repo add` seems to hang.** It's actually waiting on a yes/no confirmation that times out after 30 seconds. If you missed it, just run the command again and answer promptly.

**An addon won't load, or its commands are missing.** Run `bun run validate <addon-path>` - it checks for the most common structural mistakes (wrong file layout, a scheduled task in the wrong folder, importing something it shouldn't).

**A scheduled task in an addon never fires.** Check the folder name - it needs to be exactly `scheduled-tasks/`. Anything else is silently ignored rather than erroring, which makes this an easy one to miss. See [API reference](API_REFERENCE.md#lumischeduling).

**A config option isn't showing up anywhere.** It needs to be declared as part of the module's config schema - if it's missing there, nothing else picks it up automatically. See [API reference § `cfg`](API_REFERENCE.md#cfg).

## Running at a bigger scale

Multiple bot processes, sharding, Kubernetes, and metrics/tracing are covered in [Production Deployment](GUIDE_PRODUCTION_DEPLOYMENT.md) and [Architecture](architecture.md) - those are a different set of problems from what most single-server setups run into, so they're not duplicated here.

## Still stuck?

[Open a discussion](https://github.com/lumi-devs/Lumi/discussions) or [file an issue](https://github.com/lumi-devs/Lumi/issues). Include your logs and what you've already tried - it saves a round-trip.
