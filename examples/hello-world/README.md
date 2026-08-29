# Hello World

The minimal Lumi addon. Read this first, before the more advanced examples.

## What it shows

- `index.ts` - `@DefineModule` with a single `cfg.string` config field.
- `commands/hello.ts` - a `BaseCommand` that reads its own module's config back via `container.db.config.getModuleConfig`.
- `listeners/guildCreate.ts` - a `ModuleListener` on an event where the default guild-ID resolution doesn't apply, showing how to override `resolveGuildId`, plus basic try/catch error handling around a Discord API call.

## Commands

- `/hello` - replies with the configured greeting (default: "Hello from Lumi!"). Change it from `/config` or the dashboard.

## Installing locally for testing

Copy this directory into a `lumi-addons`-style checkout (or any directory listed in `LUMI_DEV_PATHS`) under its own top-level folder, e.g.:

```sh
cp -r examples/hello-world ../lumi-addons/hello-world
```

Then restart the worker, or use `,download`/`,repo` if serving it from a real addon repository. See the [Addon Publishing Guide](../../docs/GUIDE_ADDON_PUBLISHING.md) for the full installation flow.
