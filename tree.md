.
├── AGENTS.md
├── apps
│   ├── dashboard
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── src
│   │   │   ├── config.ts
│   │   │   ├── discord.ts
│   │   │   ├── main.ts
│   │   │   ├── rpc.ts
│   │   │   ├── server.ts
│   │   │   ├── sessions.ts
│   │   │   ├── telemetry.ts
│   │   │   ├── types.ts
│   │   │   └── views.ts
│   │   └── tsconfig.json
│   ├── gateway
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── main.ts
│   │   │   └── telemetry.ts
│   │   └── tsconfig.json
│   ├── scheduler
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── main.ts
│   │   │   └── service-name.ts
│   │   └── tsconfig.json
│   └── worker
│       ├── package.json
│       ├── src
│       │   ├── main.ts
│       │   └── telemetry.ts
│       └── tsconfig.json
├── bun.lock
├── commit_batches.sh
├── config
│   ├── advanced.config
│   ├── bot.json
│   ├── emojis.json
│   ├── observability
│   │   ├── alerts.yml
│   │   ├── grafana
│   │   │   ├── dashboards
│   │   │   │   ├── lumi-cost.json
│   │   │   │   └── lumi-overview.json
│   │   │   └── provisioning
│   │   │       ├── dashboards
│   │   │       │   └── dashboards.yml
│   │   │       └── datasources
│   │   │           └── datasources.yml
│   │   ├── otel-collector.yaml
│   │   ├── prometheus.yml
│   │   └── tempo.yaml
│   ├── postgres
│   │   ├── init-replication.sh
│   │   ├── pg_hba.conf
│   │   ├── primary.conf
│   │   └── replica-entrypoint.sh
│   ├── rabbitmq
│   │   ├── apply-ha-policy.sh
│   │   └── rabbitmq-ha.conf
│   ├── rabbitmq.conf
│   ├── README.md
│   └── redis
│       ├── redis-replica.conf
│       └── sentinel-entrypoint.sh
├── data
│   └── 3rd-party-modules
│       ├── lumi-addons
│       │   ├── activity-roles
│       │   │   ├── commands
│       │   │   │   └── activityroles.ts
│       │   │   ├── index.ts
│       │   │   ├── info.json
│       │   │   ├── lib
│       │   │   │   ├── keys.ts
│       │   │   │   ├── matcher.ts
│       │   │   │   └── store.ts
│       │   │   ├── listeners
│       │   │   │   └── presenceUpdate.ts
│       │   │   └── README.md
│       │   ├── ai-assistant
│       │   │   ├── commands
│       │   │   │   ├── ask.ts
│       │   │   │   ├── support.ts
│       │   │   │   └── tldr.ts
│       │   │   ├── index.ts
│       │   │   ├── info.json
│       │   │   ├── lib
│       │   │   │   ├── ai-executor.ts
│       │   │   │   ├── ai-tools.ts
│       │   │   │   └── internet-search.ts
│       │   │   ├── listeners
│       │   │   │   ├── guildMemberUpdate.ts
│       │   │   │   └── messageCreate.ts
│       │   │   └── scheduled-tasks
│       │   │       └── ai-request.ts
│       │   ├── auto-translate
│       │   │   ├── commands
│       │   │   │   └── translate.ts
│       │   │   ├── index.ts
│       │   │   └── info.json
│       │   ├── CONTRIBUTING.md
│       │   ├── emoji-stealer
│       │   │   ├── commands
│       │   │   │   └── steal.ts
│       │   │   ├── index.ts
│       │   │   └── info.json
│       │   ├── LICENSE
│       │   ├── README.md
│       │   ├── rolementions
│       │   │   ├── commands
│       │   │   │   ├── rolementions.ts
│       │   │   │   └── roleprotect.ts
│       │   │   ├── index.ts
│       │   │   ├── info.json
│       │   │   ├── lib
│       │   │   │   ├── automod.ts
│       │   │   │   ├── format.ts
│       │   │   │   ├── keys.ts
│       │   │   │   ├── log.ts
│       │   │   │   ├── protection.ts
│       │   │   │   └── store.ts
│       │   │   ├── listeners
│       │   │   │   └── messageCreate.ts
│       │   │   ├── README.md
│       │   │   └── scheduled-tasks
│       │   │       └── RoleBlockExpireTask.ts
│       │   ├── thread-cleaner
│       │   │   ├── index.ts
│       │   │   ├── info.json
│       │   │   ├── lib
│       │   │   │   ├── cleanup-handler.ts
│       │   │   │   └── keys.ts
│       │   │   ├── listeners
│       │   │   │   └── threadCreate.ts
│       │   │   └── scheduled-tasks
│       │   │       └── threadCleaner.ts
│       │   └── verify
│       │       ├── commands
│       │       │   └── verifytest.ts
│       │       ├── index.ts
│       │       ├── info.json
│       │       ├── interaction-handlers
│       │       │   └── captcha.ts
│       │       ├── keys.ts
│       │       ├── lib
│       │       │   └── captcha-expiry-handler.ts
│       │       ├── listeners
│       │       │   └── memberJoin.ts
│       │       └── scheduled-tasks
│       │           └── captchaExpiry.ts
│       └── verify-addons
│           ├── activity-roles
│           │   ├── commands
│           │   │   └── activityroles.ts
│           │   ├── index.ts
│           │   ├── info.json
│           │   ├── lib
│           │   │   ├── keys.ts
│           │   │   ├── matcher.ts
│           │   │   └── store.ts
│           │   ├── listeners
│           │   │   └── presenceUpdate.ts
│           │   └── README.md
│           ├── ai-assistant
│           │   ├── commands
│           │   │   ├── ask.ts
│           │   │   ├── support.ts
│           │   │   └── tldr.ts
│           │   ├── index.ts
│           │   ├── info.json
│           │   ├── lib
│           │   │   ├── ai-executor.ts
│           │   │   ├── ai-tools.ts
│           │   │   └── internet-search.ts
│           │   ├── listeners
│           │   │   ├── guildMemberUpdate.ts
│           │   │   └── messageCreate.ts
│           │   └── scheduled-tasks
│           │       └── ai-request.ts
│           ├── auto-translate
│           │   ├── commands
│           │   │   └── translate.ts
│           │   ├── index.ts
│           │   └── info.json
│           ├── CONTRIBUTING.md
│           ├── emoji-stealer
│           │   ├── commands
│           │   │   └── steal.ts
│           │   ├── index.ts
│           │   └── info.json
│           ├── LICENSE
│           ├── README.md
│           ├── rolementions
│           │   ├── commands
│           │   │   ├── rolementions.ts
│           │   │   └── roleprotect.ts
│           │   ├── index.ts
│           │   ├── info.json
│           │   ├── lib
│           │   │   ├── automod.ts
│           │   │   ├── format.ts
│           │   │   ├── keys.ts
│           │   │   ├── log.ts
│           │   │   ├── protection.ts
│           │   │   └── store.ts
│           │   ├── listeners
│           │   │   └── messageCreate.ts
│           │   ├── README.md
│           │   └── scheduled-tasks
│           │       └── RoleBlockExpireTask.ts
│           ├── thread-cleaner
│           │   ├── index.ts
│           │   ├── info.json
│           │   ├── lib
│           │   │   ├── cleanup-handler.ts
│           │   │   └── keys.ts
│           │   ├── listeners
│           │   │   └── threadCreate.ts
│           │   └── scheduled-tasks
│           │       └── threadCleaner.ts
│           └── verify
│               ├── commands
│               │   └── verifytest.ts
│               ├── index.ts
│               ├── info.json
│               ├── interaction-handlers
│               │   └── captcha.ts
│               ├── keys.ts
│               ├── lib
│               │   └── captcha-expiry-handler.ts
│               ├── listeners
│               │   └── memberJoin.ts
│               └── scheduled-tasks
│                   └── captchaExpiry.ts
├── deploy
│   └── k8s
│       ├── configmap.yaml
│       ├── gateway-statefulset.yaml
│       ├── lumi-data-pvc.yaml
│       ├── migrate-job.yaml
│       ├── namespace.yaml
│       ├── README.md
│       ├── scheduler-deployment.yaml
│       ├── secret.example.yaml
│       ├── worker-deployment.yaml
│       └── worker-scaledobject.yaml
├── docker-compose.yml
├── Dockerfile
├── errors2.txt
├── errors.txt
├── find-indirection.ts
├── flake.lock
├── flake.nix
├── indirections.txt
├── knip.json
├── LICENSE
├── lint_output2.txt
├── lint_output.txt
├── package.json
├── packages
│   ├── contracts
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── bus.ts
│   │   │   ├── config.ts
│   │   │   ├── gateway-packet.ts
│   │   │   ├── index.ts
│   │   │   ├── manifest.ts
│   │   │   └── rpc.ts
│   │   └── tsconfig.json
│   ├── core
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── languages
│   │   │   │   ├── de
│   │   │   │   │   ├── commands.json
│   │   │   │   │   ├── common.json
│   │   │   │   │   └── preconditions.json
│   │   │   │   ├── en-US
│   │   │   │   │   ├── commands.json
│   │   │   │   │   ├── common.json
│   │   │   │   │   └── preconditions.json
│   │   │   │   ├── es-ES
│   │   │   │   │   ├── commands.json
│   │   │   │   │   ├── common.json
│   │   │   │   │   └── preconditions.json
│   │   │   │   └── fr
│   │   │   │       ├── commands.json
│   │   │   │       ├── common.json
│   │   │   │       └── preconditions.json
│   │   │   ├── lib
│   │   │   │   ├── client
│   │   │   │   │   ├── LumiClient.ts
│   │   │   │   │   └── setup.ts
│   │   │   │   ├── command-context.ts
│   │   │   │   ├── commands.ts
│   │   │   │   ├── config-panel.ts
│   │   │   │   ├── config-schema.ts
│   │   │   │   ├── core-fire-handlers.ts
│   │   │   │   ├── database
│   │   │   │   │   ├── client.ts
│   │   │   │   │   ├── errors.ts
│   │   │   │   │   └── redis.ts
│   │   │   │   ├── discord-rest.ts
│   │   │   │   ├── downloader
│   │   │   │   │   ├── cards.ts
│   │   │   │   │   ├── resolver.ts
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── validate.ts
│   │   │   │   ├── entity-cache
│   │   │   │   │   ├── entity-populator.ts
│   │   │   │   │   └── RedisEntityCache.ts
│   │   │   │   ├── env.ts
│   │   │   │   ├── gdpr.ts
│   │   │   │   ├── guild-transaction.ts
│   │   │   │   ├── hub-panel.ts
│   │   │   │   ├── i18n
│   │   │   │   │   ├── augmentations.d.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── keys.ts
│   │   │   │   ├── interaction-handler.ts
│   │   │   │   ├── loggable.ts
│   │   │   │   ├── module-check.ts
│   │   │   │   ├── module-system
│   │   │   │   │   ├── config-schema.ts
│   │   │   │   │   ├── GuildMessageListener.ts
│   │   │   │   │   ├── manifest.ts
│   │   │   │   │   ├── ModuleListener.ts
│   │   │   │   │   ├── ModuleStore.ts
│   │   │   │   │   ├── Module.ts
│   │   │   │   │   ├── ServiceStore.ts
│   │   │   │   │   └── Service.ts
│   │   │   │   ├── permissions
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── preconditions
│   │   │   │   │       ├── Administrator.ts
│   │   │   │   │       ├── BotOwner.ts
│   │   │   │   │       ├── GuildOwner.ts
│   │   │   │   │       ├── Moderator.ts
│   │   │   │   │       ├── ModuleEnabled.ts
│   │   │   │   │       ├── NotBlocked.ts
│   │   │   │   │       ├── NotIgnored.ts
│   │   │   │   │       └── PermissionOverrides.ts
│   │   │   │   ├── ping-cards.ts
│   │   │   │   ├── ping-collect.ts
│   │   │   │   ├── pre-deferred-interactions.ts
│   │   │   │   ├── prisma
│   │   │   │   │   ├── DatabaseService.ts
│   │   │   │   │   └── repositories
│   │   │   │   │       ├── AccessRepository.ts
│   │   │   │   │       ├── AfkRepository.ts
│   │   │   │   │       ├── AuditRepository.ts
│   │   │   │   │       ├── ConfigHistoryRepository.ts
│   │   │   │   │       ├── ConfigOverrideRepository.ts
│   │   │   │   │       ├── ConfigRepository.ts
│   │   │   │   │       ├── DownloaderRepository.ts
│   │   │   │   │       ├── GuildKVRepository.ts
│   │   │   │   │       ├── ModerationRepository.ts
│   │   │   │   │       ├── ModuleRepository.ts
│   │   │   │   │       ├── PermissionRepository.ts
│   │   │   │   │       ├── Repository.ts
│   │   │   │   │       └── UserRepository.ts
│   │   │   │   ├── rabbitmq
│   │   │   │   │   └── index.ts
│   │   │   │   ├── redis-lock.ts
│   │   │   │   ├── restart.ts
│   │   │   │   ├── rest-coalesce.ts
│   │   │   │   ├── scheduled-tasks.ts
│   │   │   │   ├── scheduler-bus.ts
│   │   │   │   ├── scheduler-leader-lock.ts
│   │   │   │   ├── scheduler-request-consumer.ts
│   │   │   │   ├── schedule-task.ts
│   │   │   │   ├── sentry
│   │   │   │   │   └── breadcrumb.ts
│   │   │   │   ├── services
│   │   │   │   │   ├── ConfigService.ts
│   │   │   │   │   ├── DownloaderService.ts
│   │   │   │   │   ├── GuildLogService.ts
│   │   │   │   │   ├── GuildSettingsService.ts
│   │   │   │   │   └── PermissionService.ts
│   │   │   │   ├── task-fire-registry.ts
│   │   │   │   ├── telemetry
│   │   │   │   │   └── instrument.ts
│   │   │   │   ├── types
│   │   │   │   │   └── common.ts
│   │   │   │   ├── utilities
│   │   │   │   │   ├── assets.ts
│   │   │   │   │   ├── audit.ts
│   │   │   │   │   ├── branding.ts
│   │   │   │   │   ├── cards.ts
│   │   │   │   │   ├── command-errors.ts
│   │   │   │   │   ├── command-response.ts
│   │   │   │   │   ├── config.ts
│   │   │   │   │   ├── errors.ts
│   │   │   │   │   ├── formatting.ts
│   │   │   │   │   ├── listeners.ts
│   │   │   │   │   ├── pagination.ts
│   │   │   │   │   ├── resolvers
│   │   │   │   │   │   ├── duration.ts
│   │   │   │   │   │   └── fuzzy.ts
│   │   │   │   │   └── temporary-message.ts
│   │   │   │   └── utility-store
│   │   │   │       ├── RateLimitUtility.ts
│   │   │   │       └── TimeUtility.ts
│   │   │   ├── modules
│   │   │   │   ├── afk
│   │   │   │   │   ├── commands
│   │   │   │   │   │   ├── afkclean.ts
│   │   │   │   │   │   ├── afklist.ts
│   │   │   │   │   │   ├── afkstats.ts
│   │   │   │   │   │   └── afk.ts
│   │   │   │   │   ├── data
│   │   │   │   │   │   └── afk.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── interaction-handlers
│   │   │   │   │   │   └── mentions.ts
│   │   │   │   │   ├── keys.ts
│   │   │   │   │   ├── lib
│   │   │   │   │   │   └── delete-handler.ts
│   │   │   │   │   ├── listeners
│   │   │   │   │   │   └── messageCreate.ts
│   │   │   │   │   ├── manifest.json
│   │   │   │   │   ├── scheduled-tasks
│   │   │   │   │   │   └── afkDeleteMessage.ts
│   │   │   │   │   └── services
│   │   │   │   │       └── AfkService.ts
│   │   │   │   ├── core
│   │   │   │   │   ├── commands
│   │   │   │   │   │   ├── about.ts
│   │   │   │   │   │   ├── dashboard.ts
│   │   │   │   │   │   ├── download.ts
│   │   │   │   │   │   ├── help.ts
│   │   │   │   │   │   ├── lumi.ts
│   │   │   │   │   │   ├── module.ts
│   │   │   │   │   │   ├── ping.ts
│   │   │   │   │   │   └── repo.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── interaction-handlers
│   │   │   │   │   │   ├── config-panel.ts
│   │   │   │   │   │   ├── hub-panel.ts
│   │   │   │   │   │   ├── module-restart.ts
│   │   │   │   │   │   ├── module-update.ts
│   │   │   │   │   │   └── ping.ts
│   │   │   │   │   └── listeners
│   │   │   │   │       ├── bus
│   │   │   │   │       │   ├── guildAvailable.ts
│   │   │   │   │       │   ├── guildCreate.ts
│   │   │   │   │       │   ├── guildDelete.ts
│   │   │   │   │       │   ├── memberJoin.ts
│   │   │   │   │       │   └── memberLeave.ts
│   │   │   │   │       ├── commands
│   │   │   │   │       │   ├── applicationCommandRegistriesRegistered.ts
│   │   │   │   │       │   ├── chatInputCommandDenied.ts
│   │   │   │   │       │   ├── chatInputCommandError.ts
│   │   │   │   │       │   ├── chatInputSubcommandError.ts
│   │   │   │   │       │   ├── commandAutocompleteInteractionError.ts
│   │   │   │   │       │   ├── contextMenuCommandDenied.ts
│   │   │   │   │       │   ├── contextMenuCommandError.ts
│   │   │   │   │       │   ├── messageCommandDenied.ts
│   │   │   │   │       │   ├── messageCommandError.ts
│   │   │   │   │       │   └── messageSubcommandError.ts
│   │   │   │   │       ├── errors
│   │   │   │   │       │   ├── clientError.ts
│   │   │   │   │       │   ├── interactionHandlerError.ts
│   │   │   │   │       │   ├── interactionHandlerParseError.ts
│   │   │   │   │       │   ├── listenerError.ts
│   │   │   │   │       │   └── scheduledTaskError.ts
│   │   │   │   │       ├── guildCreate.ts
│   │   │   │   │       ├── ready.ts
│   │   │   │   │       ├── routing
│   │   │   │   │       │   └── guildUserMessage.ts
│   │   │   │   │       ├── shard
│   │   │   │   │       │   ├── shardDisconnect.ts
│   │   │   │   │       │   ├── shardError.ts
│   │   │   │   │       │   ├── shardReady.ts
│   │   │   │   │       │   ├── shardReconnecting.ts
│   │   │   │   │       │   └── shardResume.ts
│   │   │   │   │       └── telemetryStats.ts
│   │   │   │   ├── dashboard
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── manifest.json
│   │   │   │   ├── filter
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── lib
│   │   │   │   │   │   └── rules.ts
│   │   │   │   │   ├── listeners
│   │   │   │   │   │   └── messageCreate.ts
│   │   │   │   │   ├── manifest.json
│   │   │   │   │   └── services
│   │   │   │   │       └── FilterService.ts
│   │   │   │   ├── logging
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── lib
│   │   │   │   │   │   └── send.ts
│   │   │   │   │   ├── listeners
│   │   │   │   │   │   ├── banAdd.ts
│   │   │   │   │   │   ├── banRemove.ts
│   │   │   │   │   │   ├── memberAdd.ts
│   │   │   │   │   │   ├── memberRemove.ts
│   │   │   │   │   │   ├── memberUpdate.ts
│   │   │   │   │   │   ├── messageDelete.ts
│   │   │   │   │   │   └── messageUpdate.ts
│   │   │   │   │   └── manifest.json
│   │   │   │   ├── mod
│   │   │   │   │   ├── commands
│   │   │   │   │   │   ├── ban.ts
│   │   │   │   │   │   ├── cases.ts
│   │   │   │   │   │   ├── kick.ts
│   │   │   │   │   │   ├── quarantine.ts
│   │   │   │   │   │   ├── sanitize.ts
│   │   │   │   │   │   ├── timeout.ts
│   │   │   │   │   │   └── warn.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── lib
│   │   │   │   │   │   ├── helpers.ts
│   │   │   │   │   │   ├── lift-handler.ts
│   │   │   │   │   │   └── thresholds.ts
│   │   │   │   │   ├── manifest.json
│   │   │   │   │   └── scheduled-tasks
│   │   │   │   │       └── modLift.ts
│   │   │   │   └── utility
│   │   │   │       ├── index.ts
│   │   │   │       ├── manifest.json
│   │   │   │       ├── nick
│   │   │   │       │   ├── commands
│   │   │   │       │   │   └── nick.ts
│   │   │   │       │   ├── index.ts
│   │   │   │       │   └── manifest.json
│   │   │   │       ├── purge
│   │   │   │       │   ├── commands
│   │   │   │       │   │   └── purge.ts
│   │   │   │       │   ├── index.ts
│   │   │   │       │   └── manifest.json
│   │   │   │       ├── serverinfo
│   │   │   │       │   ├── commands
│   │   │   │       │   │   └── serverinfo.ts
│   │   │   │       │   ├── index.ts
│   │   │   │       │   └── manifest.json
│   │   │   │       ├── tempvc
│   │   │   │       │   ├── commands
│   │   │   │       │   │   └── tempvc.ts
│   │   │   │       │   ├── data.ts
│   │   │   │       │   ├── index.ts
│   │   │   │       │   ├── interaction-handlers
│   │   │   │       │   │   ├── buttons.ts
│   │   │   │       │   │   ├── modals.ts
│   │   │   │       │   │   └── selects.ts
│   │   │   │       │   ├── keys.ts
│   │   │   │       │   ├── lib
│   │   │   │       │   │   ├── cleanup-handler.ts
│   │   │   │       │   │   └── voice-occupancy.ts
│   │   │   │       │   ├── listeners
│   │   │   │       │   │   ├── raw.ts
│   │   │   │       │   │   ├── ready.ts
│   │   │   │       │   │   └── voiceStateUpdate.ts
│   │   │   │       │   ├── manifest.json
│   │   │   │       │   ├── registry.ts
│   │   │   │       │   ├── scheduled-tasks
│   │   │   │       │   │   └── cleanup.ts
│   │   │   │       │   ├── services
│   │   │   │       │   │   └── TempVcService.ts
│   │   │   │       │   └── ui
│   │   │   │       │       └── panel.ts
│   │   │   │       ├── user_media
│   │   │   │       │   ├── commands
│   │   │   │       │   │   ├── avatar.ts
│   │   │   │       │   │   └── banner.ts
│   │   │   │       │   ├── index.ts
│   │   │   │       │   ├── interaction-handlers
│   │   │   │       │   │   └── view.ts
│   │   │   │       │   ├── manifest.json
│   │   │   │       │   └── media-utils.ts
│   │   │   │       └── whois
│   │   │   │           ├── commands
│   │   │   │           │   └── whois.ts
│   │   │   │           ├── index.ts
│   │   │   │           └── manifest.json
│   │   │   └── scheduled-tasks
│   │   │       └── flushLogs.ts
│   │   ├── tests
│   │   │   ├── core
│   │   │   │   ├── hub-panel.test.ts
│   │   │   │   ├── i18n.test.ts
│   │   │   │   ├── module_command.test.ts
│   │   │   │   ├── module_store.test.ts
│   │   │   │   ├── permission-overrides.test.ts
│   │   │   │   ├── permissions.test.ts
│   │   │   │   └── validate-addon.test.ts
│   │   │   ├── modules
│   │   │   │   ├── afk
│   │   │   │   │   └── afk.test.ts
│   │   │   │   ├── filter
│   │   │   │   │   └── rules.test.ts
│   │   │   │   ├── mod
│   │   │   │   │   └── case-number-concurrency.test.ts
│   │   │   │   ├── serverinfo
│   │   │   │   │   └── serverinfo.test.ts
│   │   │   │   └── whois
│   │   │   │       └── whois.test.ts
│   │   │   └── utilities
│   │   │       ├── formatting.test.ts
│   │   │       └── time.test.ts
│   │   └── tsconfig.json
│   ├── event-bus
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── factory.ts
│   │   │   ├── index.ts
│   │   │   ├── InProcBus.ts
│   │   │   ├── NatsJetStreamBus.ts
│   │   │   ├── RawGatewayConsumer.ts
│   │   │   ├── RawGatewayPublisher.ts
│   │   │   ├── RedisStreamsBus.ts
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   ├── observability
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── boot.ts
│   │   │   ├── context.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   ├── metrics.ts
│   │   │   ├── readiness.ts
│   │   │   ├── shutdown.ts
│   │   │   └── tracing.ts
│   │   └── tsconfig.json
│   ├── sdk
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── sharding
│       ├── package.json
│       ├── src
│       │   ├── cluster-bootstrap.ts
│       │   ├── cluster-ready.ts
│       │   ├── coordinator.ts
│       │   ├── dynamic-strategy.ts
│       │   ├── index.ts
│       │   ├── redis-throttler.ts
│       │   ├── session-store.ts
│       │   └── shard-planner.ts
│       └── tsconfig.json
├── prisma
│   ├── generated
│   │   └── client
│   │       ├── client.d.ts
│   │       ├── client.js
│   │       ├── default.d.ts
│   │       ├── default.js
│   │       ├── edge.d.ts
│   │       ├── edge.js
│   │       ├── index-browser.js
│   │       ├── index.d.ts
│   │       ├── index.js
│   │       ├── package.json
│   │       ├── query_compiler_fast_bg.js
│   │       ├── query_compiler_fast_bg.wasm
│   │       ├── query_compiler_fast_bg.wasm-base64.js
│   │       ├── runtime
│   │       │   ├── client.d.ts
│   │       │   ├── client.js
│   │       │   ├── index-browser.d.ts
│   │       │   ├── index-browser.js
│   │       │   └── wasm-compiler-edge.js
│   │       ├── schema.prisma
│   │       ├── wasm-edge-light-loader.mjs
│   │       └── wasm-worker-loader.mjs
│   ├── migrations
│   │   ├── 20260712085455_init
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── prisma.config.ts
├── README.md
├── scripts
│   ├── chaos-autoscale.ts
│   ├── chaos-cluster.ts
│   ├── chaos-gateway-proxy.ts
│   ├── chaos-nats-dlq.ts
│   ├── chaos-rolling-deploy.ts
│   ├── chaos-streams.ts
│   ├── generate-manifests.ts
│   ├── loadtest-rest.ts
│   ├── validate-addon.ts
│   ├── verify-addons.ts
│   ├── verify-chaos.ts
│   └── verify-scheduler-catchup.ts
├── strip_comments.mjs
├── todo.txt
├── tree.md
├── tsconfig.base.json
├── tsconfig.json
└── vitest.config.ts

186 directories, 514 files
