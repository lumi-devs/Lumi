---
"@lumi/core": minor
"@lumi/dashboard": minor
"@lumi/sharding": minor
"@lumi/contracts": minor
---

Replaces the dashboard's sidebar navigation with a top nav and splits add-ons out of the modules page. Finishes the sharding-coordinator removal in favor of static shard-plan assignment, adds addon revision-pin install and rollback, completes the RabbitMQ-to-internal-HTTP-RPC migration, and fixes card/embed branding colors defaulting to black by introducing a single `resolveCardColor()`/`defaultCardColors` source of truth in `config.ts`. Also debloats moderation/security/filter/afk/tempvc/module-system/dashboard code via shared helpers, and adds an update-check confirmation step (Update/Skip) to the add-ons repo panel.
