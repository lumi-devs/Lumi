# Lumi v2 TODO

## ✅ Completed

- [x] Project structure: apps/bot, modules/, packages/
- [x] Built-in services: core, admin (non-disableable)
- [x] Toggleable modules: mod, leveling, economy, filter, utility, tempvc, logging, afk
- [x] Module system: module-kit contracts, module-runtime loader, downloader
- [x] Permit system: time-based expiry, conditions (channel/role/time), no enforced tier
- [x] Cache: L1 LRU + L2 Redis with invalidation bus
- [x] Database: Prisma schema with all models
- [x] Architecture docs updated (AGENTS.md, modules.md, architecture.md)
- [x] User-facing SETUP.md documentation
- [x] Mod commands: ban, unban, kick, timeout, warn, purge, note, lock, unlock, lockdown, softban, quarantine, unquarantine, vcmute, unvcmute, case, cases
- [x] Economy balance card integration in `/balance` command
- [x] Economy shop cards integration in `/shop` and `/buy` commands
- [x] Permit audit log (createAuditLog, getAuditLogs)
- [x] Permit import/export (exportPermits, importPermits)
- [x] Fleet architecture: manager, worker, distributed scheduler, cross-shard RPC
- [x] Docker Compose (PostgreSQL 18, Redis 8) + K8s manifests
- [x] Build & typecheck passing

## 🚧 In Progress

## 📋 Pending

### Core Features
- [x] Image generation for economy shop cards
- [x] Permit schedule/cron expressions
- [x] Permit audit log
- [x] Permit import/export

### RPC & Dashboard
- [ ] Dashboard frontend (React/Vue)
- [ ] WebSocket for real-time updates
- [ ] Dashboard auth (Discord OAuth2)

### Fleet Architecture (Multi-process)
- [x] Manager process (shard allocation, health, rolling deploy)
- [x] Worker process (shard subset, fleet client)
- [x] Fleet RPC (status, rebalance, health)
- [x] Distributed scheduler (leader election)
- [x] Cross-shard RPC (global leaderboards, economy sync)

### Testing
- [x] Unit tests for core packages (cache, permits, module-kit, fleet)
- [x] Integration tests (bot + modules)
- [x] Load testing (10k+ guilds)
- [x] CI/CD pipeline

### Documentation
- [x] Module development guide
- [x] Addon development guide
- [x] Migration guide from v1

### Operations
- [x] Docker Compose for local dev
- [x] Kubernetes manifests
- [x] PostgreSQL 18 + Redis 8 configs
- [x] Backup/restore procedures
- [x] Monitoring dashboards (Grafana)
- [x] Alerting rules