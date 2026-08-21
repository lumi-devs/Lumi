# FAQ

## What is Lumi?

A Discord bot you run yourself - on your own computer, your own server, or a cheap VPS. You get moderation, anti-raid protection, verification, logging, and more, and it's your data the whole time. See [what Lumi does](modules.md) for the full list.

## What's the difference between a "module" and an "addon"?

They work the same way under the hood - the difference is just where the code lives.

- A **module** ships with Lumi itself, built in from the start.
- An **addon** is a plugin someone else wrote, that you install separately (usually from [`lumi-addons`](https://github.com/lumi-devs/lumi-addons)) without needing to update the bot.

Want to build one? Start with [Quick start](QUICK_START_ADDON.md) for an addon, or [Building a module](GUIDE_MODULE_CREATION.md) if you're contributing to Lumi itself.

## Do I need the web dashboard?

No. Everything works from Discord using slash commands and `/lumi panel`. The dashboard is a nice-to-have for people who prefer clicking around a web page over typing commands - it's entirely optional, and you can turn it off without losing anything else. See [Self-hosting § the web dashboard](GUIDE_SELF_HOSTING.md#6-optional-the-web-dashboard) if you want it.

## Is the verification challenge a real CAPTCHA?

No - it's a row of emoji buttons the new member has to click in the right order. It stops simple join-and-spam bots, but it won't stop someone determined to get past it manually. Good first line of defense, not a silver bullet.

## Is it safe to install addons?

Only as safe as the person who wrote them. Addon code runs inside the bot with full access to everything it can see - your server data, your database, all of it. Lumi doesn't review or vet addons before you install them. You'll get a one-time warning before anything is cloned - only say yes to addons from people you trust. See [Publishing an addon](GUIDE_ADDON_PUBLISHING.md#how-installation-works) and the [security policy](../SECURITY.md).

## If I ask Lumi to delete my data, does it actually happen?

Mostly, yes. When a deletion request comes in, Lumi asks every loaded feature to remove anything it's stored about that user, then removes the shared records too. A couple of built-in features don't implement this yet, so it's not airtight everywhere - but it's not just a token gesture either. See [what Lumi does § data and privacy](modules.md#data-and-privacy) for the current state.

## How do I update?

```bash
git pull && bun install && bun run db:migrate
```

Then restart the bot - `docker compose up -d --build worker` if you're on Docker, or just restart your process otherwise. Worth a quick look at the [changelog](../packages/core/CHANGELOG.md) or GitHub Releases first, in case anything needs manual attention. Details: [Self-hosting § updating](GUIDE_SELF_HOSTING.md#updating).

## Is my data safe if the Redis container dies?

Yes. Redis only holds things that are fine to lose - caches, rate limits, queues - and it rebuilds them on its own. Postgres is where everything that actually matters lives, so that's the one worth backing up. See [Self-hosting § backups](GUIDE_SELF_HOSTING.md#backups).

## Can I help translate Lumi?

Yes, please - translations happen through [Crowdin](https://crowdin.com/project/lumi-bot). See the [README](../README.md#translations) for how to jump in.

## Something on this page is wrong

That's a docs bug, not a you problem - [open an issue](https://github.com/lumi-devs/Lumi/issues) or start a [discussion](https://github.com/lumi-devs/Lumi/discussions) and we'll sort it out.
