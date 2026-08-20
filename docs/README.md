# Lumi docs

Lumi is a Discord bot you run yourself. Serious moderation and security, on your own server, configured your way.

This folder is the source for the [docs site](https://lumi-devs.github.io/Lumi/) - read it there for a nicer layout, or browse it here.

## Running Lumi

- [Self-hosting](GUIDE_SELF_HOSTING.md) - get Lumi up and running on your own machine or server.
- [What Lumi does](modules.md) - the nine built-in features, and how the security tools actually work.
- [FAQ](FAQ.md) - do I need the dashboard? Is my data safe? Can I help translate?
- [Troubleshooting](TROUBLESHOOTING.md) - bot won't start, dashboard won't log in, commands aren't showing up.

## Building on Lumi

Lumi's plugin system - we call them addons - is deliberately similar to Red-DiscordBot's, so if you've written a Red cog before, this will feel familiar.

- [Quick start](QUICK_START_ADDON.md) - go from a clean checkout to a working command in a few minutes.
- [Building a module](GUIDE_MODULE_CREATION.md) - a full walkthrough of writing a real feature, start to finish.
- [Publishing an addon](GUIDE_ADDON_PUBLISHING.md) - share what you built with everyone else.
- [API reference](API_REFERENCE.md) - everything importable from `"lumi"`, documented.

## Going deeper

- [Architecture](architecture.md) - how the pieces fit together under the hood - processes, the event bus, the database, sharding.
- [Production deployment](GUIDE_PRODUCTION_DEPLOYMENT.md) - running Lumi at a bigger scale - clustering, secrets, zero-downtime deploys.
- [Dashboard reference](dashboard.md) - everything about the web dashboard - routes, auth, and how it talks to the bot.
- [Configuration reference](configuration.md) - every environment variable and what it does.

## Project

- [Contributing guide](../CONTRIBUTING.md) - coding standards, workflow, pull requests.
- [Security policy](../SECURITY.md) - found a vulnerability? Start here.
- [AI & Agent Blueprint](../AGENTS.md) - operating rules for AI agents working in this codebase.

## Links

- [GitHub repository](https://github.com/lumi-devs/Lumi)
- [Issues](https://github.com/lumi-devs/Lumi/issues)
- [Discussions](https://github.com/lumi-devs/Lumi/discussions)
- [Security advisories](https://github.com/lumi-devs/Lumi/security/advisories)
