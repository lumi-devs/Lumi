# Wave 10: Documentation Audit & Plan

**Date**: 2026-09-03  
**Status**: Audit Complete | Plan Ready  
**Scope**: Comprehensive documentation review for user, operator, and developer audiences

---

## Executive Summary

Lumi has **strong foundational documentation** (~1,500 lines in the main docs site) covering architecture, configuration, addons, and deployment. However, several **critical gaps** exist that would prevent users and operators from being self-sufficient:

| Category | Status | Priority | Owner |
| :--- | :--- | :--- | :--- |
| **User/Admin Docs** | ⚠️ Partial | HIGH | Admin user commands reference missing |
| **Operator/Deployment** | ✅ Strong | MEDIUM | Production deployment mostly complete; backup/restore missing |
| **Developer Docs** | ✅ Strong | MEDIUM | Addon/module creation well documented; testing/patterns need expansion |
| **Quality/Sync** | ⚠️ Inconsistent | HIGH | Some stale references; needs reconciliation pass |

**Total existing doc files**: 19 markdown files in `apps/docs/src/content/docs/` + comprehensive examples  
**Estimated missing pages**: 11 critical documents (50–250 lines each)  
**Estimated effort to complete Wave 10**: 60–80 hours hands-on writing

---

## 1. Current Documentation Audit

### 1.1 What Exists (Verified ✅)

#### **Core Architecture** (500+ lines)
- ✅ `architecture.md` (187 lines) — Process model, sharding, primary shard election, inter-process communication
- ✅ `sharding.md` (57 lines) — Shard telemetry dashboard
- ✅ `event-bus.md` (53 lines) — Redis Streams event bus
- ✅ `database.md` (76 lines) — Prisma schema, repositories, migrations
- ✅ `observability.md` (43 lines) — Prometheus metrics, OTEL tracing, health probes

**Quality**: Excellent. Includes diagrams, system topology, and implementation details. No stale references found.

#### **Configuration & Operations** (400+ lines)
- ✅ `configuration.md` (169 lines) — 40+ environment variables, Docker Compose, Kubernetes
- ✅ `guides/production-deployment.md` (249 lines) — Docker Compose production stack, K8s manifests, HA setup
- ✅ `guides/self-hosting.md` (153 lines) — Quick start, development setup, local workflow
- ✅ `troubleshooting.md` (58 lines) — 8 common issues with resolutions

**Quality**: Good. Covers 90% of operator needs. **Gaps**: Monitoring/alerts setup, backup/restore procedures, scaling runbook, performance tuning.

#### **Addon/Module Development** (800+ lines)
- ✅ `api-reference.md` (399 lines) — Complete SDK surface: `lumi`, `lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`
- ✅ `guides/module-creation.md` (363 lines) — Step-by-step walkthrough, config schema, commands, listeners, scheduled tasks
- ✅ `guides/addon-publishing.md` (150 lines) — `info.json` spec, validation, repository registration, release workflow
- ✅ `guides/quick-start-addon.md` (128 lines) — Minimal "Hello World" addon with examples
- ✅ `modules.md` (141 lines) — 9 built-in modules, module vs. addon distinction, downloader architecture

**Quality**: Excellent. Examples provided, comprehensive SDK reference. **Gaps**: Testing guide (unit/integration), common patterns & anti-patterns, troubleshooting addon issues.

#### **User/Admin Docs** (200+ lines)
- ✅ `faq.md` (69 lines) — 8 questions covering modules, GDPR, updates
- ✅ `permissions.md` (59 lines) — Permit nodes, command gating, guild overrides
- ✅ `privacy.md` (88 lines) — GDPR, data deletion, user data export flows
- ✅ `README.md` (100+ lines) — Features, self-hosting quick start
- ✅ `CONTRIBUTING.md` (223 lines) — Setup, changesets, code standards, verification

**Quality**: Good basics. **Gaps**: Command reference (auto-generated), dashboard user guide, admin workflow guide.

#### **Dashboard Documentation** (Internal, separate)
- ✅ `apps/dashboard/docs/design-system.md` — Design tokens, motion, accessibility (WCAG 2.2 AA)
- ✅ `apps/dashboard/docs/component-reference.md` — Component usage, patterns
- ✅ `apps/dashboard/docs/WAVE-5-AUDIT.md` — Design system audit results

**Quality**: Excellent but internal-facing (not in main docs site). **Gaps**: End-user guide for dashboard operations.

---

### 1.2 What's Stale or Inconsistent

| Issue | Location | Impact | Fix |
| :--- | :--- | :--- | :--- |
| Addon path references inconsistent | `examples/hello-world/README.md` links to non-existent `GUIDE_ADDON_PUBLISHING.md` | Minor | Update example links |
| Dashboard RPC action count | `AGENTS.md` states "66 actions" | Medium | Verify current count, update if changed |
| Config field types outdated | `modules.md` may not reflect all `cfg.*` builders | Medium | Cross-check with `api-reference.md` |
| Event stream defaults | `configuration.md` lists defaults, verify against code | Low | Spot-check against `packages/event-bus` |

---

### 1.3 What's Missing (Critical for Wave 10)

#### **CRITICAL (Block users/operators)**

| Page | Category | Lines | Why It's Critical |
| :--- | :--- | :---: | :--- |
| **Command Reference** | User/Admin | 300–500 | Users cannot discover commands without Discord `/help` or documentation. No CLI reference outside Discord. |
| **Dashboard User Guide** | User/Admin | 200–300 | Operators don't know how to use the web panel: server config, module toggles, member management, logs. |
| **Monitoring & Alerts Setup** | Operator | 150–200 | No guide for Prometheus scraping, Grafana dashboards, alerting rules, on-call workflows. |
| **Backup & Restore Procedures** | Operator | 100–150 | No runbook for PostgreSQL backup strategies, restore validation, disaster recovery. |
| **Module Development Patterns** | Developer | 200–300 | No guide to common patterns (service layers, cross-module communication via EventBus, config-driven behavior, error handling). |

#### **IMPORTANT (Improve operator/dev experience)**

| Page | Category | Lines | Benefit |
| :--- | :--- | :---: | :--- |
| **Scaling & Performance Tuning** | Operator | 150–200 | DB pool sizing, Redis maxmemory policy, connection limits, shard sizing, rate limiting config. |
| **Database Schema Guide** | Operator/Dev | 150–200 | Entity relationships, key fields, indexes, migration strategy, data retention. |
| **Testing Guide** | Developer | 200–300 | Unit/integration/E2E testing strategies, mock Prisma, mocking Discord API, test runners. |
| **RPC Action Reference** | Developer | 100–150 | Dashboard developers need callable RPC actions documented (current `66` actions). |
| **Migration & Version Upgrade Guide** | Operator | 100–150 | Schema migrations, breaking changes by version, addon compatibility, rollback procedures. |
| **Common Errors & Resolution** | Operator/Dev | 150–200 | Extended troubleshooting (module load failures, permission issues, RPC timeouts, pool exhaustion). |

#### **NICE-TO-HAVE (Polish & completeness)**

| Page | Category | Lines | Benefit |
| :--- | :--- | :---: | :--- |
| **Development Workflow** | Developer | 100–150 | Local iteration on modules, hot-reload, debugging, logs. |
| **Addon Security Best Practices** | Developer | 80–100 | Input validation, no hardcoded secrets, permission principle, API abuse prevention. |
| **Localization (i18n) Guide** | Developer | 80–100 | Crowdin workflow, translation keys, fallback behavior, adding new languages. |

---

## 2. Documentation Quality Standards (Wave 10)

Every page must meet these criteria:

### Content Quality
- [ ] **Sufficiency**: Understand topic without reading source code (except API references)
- [ ] **Runnable Examples**: Code snippets that actually work (tested or marked hypothetical)
- [ ] **WHY not just WHAT**: Explain tradeoffs, when to use this vs. alternatives
- [ ] **Accuracy**: Reflects current code (v0.3.0+)
- [ ] **Cross-References**: Links to related pages, no orphaned docs

### Structure
- [ ] **Clear Headings**: H2/H3 hierarchy, scannable
- [ ] **Table of Contents** (for pages >5 sections)
- [ ] **Frontmatter**: YAML with `title`, `description`, `category`
- [ ] **Visual Aids**: Diagrams where helpful (ASCII or SVG)

### Completeness Checklist
- [ ] **Getting Started section** (for operational docs)
- [ ] **Troubleshooting subsection** (for configuration docs)
- [ ] **Examples** (for developer docs)
- [ ] **Links to related pages** (cross-references)

### Accessibility
- [ ] Readable at 14px font (no microscopic code)
- [ ] Code blocks syntax-highlighted
- [ ] Tables clear row headers
- [ ] No images as sole information source

---

## 3. Wave 10 Execution Plan

### Phase 1: Critical Gaps (Weeks 1–2, 30–40 hours)

**Goal**: Unblock users and operators from being self-sufficient.

#### 1.1 Command Reference (`commands.md`) — 300–400 lines
- **Owner**: Code + CLI generation, hand-written augmentation
- **Contents**:
  - Generated reference of all commands grouped by module (afk, core, filter, logging, mod, security, tempvc, utility)
  - Per-command: usage, parameters, permissions required, examples
  - User-facing (not internal)
  - Link to `/lumi panel` and web dashboard for module config
- **Quality Gate**: Every command has a working example
- **Deliverable**: `apps/docs/src/content/docs/commands.md`

#### 1.2 Dashboard User Guide (`dashboard-user-guide.md`) — 250–300 lines
- **Owner**: UX review of current dashboard + screenshot guide
- **Contents**:
  - Dashboard access (OAuth2, login flow)
  - Navigation (main sections, sidebar)
  - Server Configuration (Guild Settings, module toggles)
  - Module-Specific Controls (per-module config UI, how to read/write settings)
  - Member Management (warnings, cases, notes)
  - Logging & Audit (viewing logs, filtering)
  - Permissions Panel (permit binding, role/channel overrides)
  - Dashboard RPC bridge (how it talks to bot, error handling)
- **Screenshots**: At least 8 (setup, config, permissions, logs, etc.)
- **Quality Gate**: An operator with no prior dashboard use can operate it
- **Deliverable**: `apps/docs/src/content/docs/guides/dashboard-user-guide.md`

#### 1.3 Monitoring & Alerts Setup (`monitoring-alerts.md`) — 200–250 lines
- **Owner**: Observability review + Prometheus/Grafana walkthrough
- **Contents**:
  - Metrics endpoint (port 9090, `/metrics` format)
  - Prometheus scrape config (example `prometheus.yml`)
  - Key metrics to monitor (gateway_ping, command latency, event_stream_lag, db_pool_active)
  - Grafana dashboard (example JSON, import steps)
  - Alert rules (example PromQL for high ping, pool exhaustion, stream lag)
  - On-call integration (Alertmanager, Slack, PagerDuty patterns)
  - Health checks (`/healthz`, `/readyz` endpoints)
- **Quality Gate**: An operator can set up Prometheus + Grafana + alerts in 30 minutes
- **Deliverable**: `apps/docs/src/content/docs/guides/monitoring-alerts.md`

#### 1.4 Backup & Restore Procedures (`backup-restore.md`) — 150–200 lines
- **Owner**: Database + disaster recovery planning
- **Contents**:
  - PostgreSQL backup strategies (pg_dump, WAL archival, automated snapshots)
  - Redis persistence (RDB vs. AOF, what's critical vs. regenerable)
  - Docker Compose backup flow (example script)
  - Kubernetes persistent volume backup (snapshot, PVC recovery)
  - Restore validation (integrity checks, test restore)
  - Disaster recovery runbook (total data loss scenario)
  - RTO/RPO targets per scenario
- **Quality Gate**: Operator can recover from a complete data loss event
- **Deliverable**: `apps/docs/src/content/docs/guides/backup-restore.md`

### Phase 2: Important Gaps (Weeks 3–4, 20–30 hours)

**Goal**: Support developer and operator workflow optimization.

#### 2.1 Module Development Patterns (`guides/module-patterns.md`) — 250–300 lines
- **Owner**: Code examples from existing modules (afk, logging, security, tempvc)
- **Contents**:
  - Service Layer Pattern (DatabaseService, EventBus, Redis abstractions)
  - Configuration-Driven Behavior (cfg fields, override per guild, reading config at runtime)
  - Event-Driven Communication (EventBus for cross-module coordination without direct imports)
  - Command Lifecycle (CommandContext, error handling, reply utilities)
  - Scheduled Tasks (lifecycle, hourly/daily/weekly patterns, error recovery)
  - Listener Patterns (guild events, message events, guildMessageCreate filter)
  - GDPR Compliance (deleteUserData, exportUserData implementations)
- **Anti-Patterns**: What not to do (direct sibling imports, container.prisma, hardcoded embeds)
- **Quality Gate**: Developer can build a new module without reading 5 reference examples
- **Deliverable**: `apps/docs/src/content/docs/guides/module-patterns.md`

#### 2.2 Scaling & Performance Tuning (`guides/scaling-performance.md`) — 200–250 lines
- **Owner**: Performance review + operational tuning guide
- **Contents**:
  - Shard Sizing (how many shards for server count, per-shard memory footprint)
  - Database Connection Pooling (POSTGRES_POOL_MAX vs. POSTGRES_POOL_TOTAL, PgBouncer tuning)
  - Redis Optimization (maxmemory policy, DB separation, Streams MAXLEN tuning)
  - Event Stream Backpressure (EVENT_STREAM_MAX_DELIVERIES, ACK_WAIT_MS, CLAIM_INTERVAL_MS)
  - Rate Limiting (Discord API rate limit coordinator, REST proxy setup)
  - Metrics to Watch (queries/sec, pool active, stream lag, command p99 latency)
  - Bottleneck Diagnosis (how to find the slow path)
  - Cost Optimization (spot instances, reserved capacity, resource requests)
- **Quality Gate**: Operator can diagnose and resolve a slow deployment
- **Deliverable**: `apps/docs/src/content/docs/guides/scaling-performance.md`

#### 2.3 Testing Guide (`guides/testing-strategy.md`) — 250–300 lines
- **Owner**: Reference `docs/test-strategy.md` (Wave 9 audit) + best practices
- **Contents**:
  - Unit Testing (Vitest setup, mocking Prisma, mocking Discord API, testing commands)
  - Integration Testing (with in-memory Prisma, event bus mocking)
  - E2E Testing (Vercel Agent Browser, full command flows)
  - Test Coverage Goals (80%+ for modules, 90%+ for core)
  - Mock Strategies (Prisma mock factory, Discord guild/member mocks)
  - Testing Commands (CommandContext mock, interaction mocking)
  - Testing Scheduled Tasks (task runner mock, time mocking)
  - CI/CD Integration (GitHub Actions, test matrix by shard)
- **Quality Gate**: Developer writes 80%+ coverage without tribal knowledge
- **Deliverable**: `apps/docs/src/content/docs/guides/testing-strategy.md`

#### 2.4 Database Schema Guide (`database-schema.md`) — 150–200 lines
- **Owner**: Prisma schema review + ER diagram
- **Contents**:
  - Entity Overview (Guild, Member, ModCase, WarningCase, AuditLog, etc.)
  - Key Fields & Indexes (guildId, userId, timestamps, soft-delete markers)
  - Relationships (1:N, N:N, cascade rules)
  - Data Retention (audit log retention, warning decay, temporary data cleanup)
  - Migration Safety (zero-downtime, backward-compatible schema changes)
  - Query Patterns (pagination, soft-delete filtering, guild scoping)
  - Repository Layer (how DatabaseService abstracts Prisma)
- **Visual**: ER diagram (text-based or inline SVG)
- **Quality Gate**: Developer understands what data exists and how it connects
- **Deliverable**: `apps/docs/src/content/docs/database-schema.md`

### Phase 3: Polish & Verification (Week 5, 10–15 hours)

**Goal**: Consistency pass, cross-references, and quality assurance.

#### 3.1 Extended Troubleshooting (`troubleshooting-extended.md`) — 200–250 lines
- **Owner**: Merge with existing `troubleshooting.md` or expand
- **Contents**:
  - Module Load Failures (addon validation, missing dependencies, conflicts)
  - Permission Issues (permit nodes not appearing, role overrides not working)
  - RPC Timeouts (dashboard can't reach worker, internal token mismatch)
  - Connection Pool Exhaustion (too many active connections, idle timeout tuning)
  - Event Stream Backlog (consumer lag growing, poison messages in DLQ)
  - Scheduled Task Misfire (BullMQ not running, cron pattern issues)
  - Shard Desync (some shards have stale cache, guild-id routing broken)
  - GDPR Data Deletion Failures (user not found, async job stalled)
- **Quality Gate**: Operator can self-diagnose 80% of issues
- **Deliverable**: Merge into `apps/docs/src/content/docs/troubleshooting.md` or new file

#### 3.2 RPC Action Reference (`rpc-actions.md`) — 150–200 lines
- **Owner**: Extract from `packages/contracts/src/rpc.ts` + hand documentation
- **Contents**:
  - All 66 RPC actions listed (guild.read, guild.write, member.*, module.*, config.*, etc.)
  - Per-action: signature, parameters, return type, error cases, example request/response
  - Auth requirements (RPC_INTERNAL_TOKEN validation)
  - Rate limiting (if applicable)
- **Quality Gate**: Dashboard developer can call any RPC action without reading code
- **Deliverable**: `apps/docs/src/content/docs/api-reference-rpc.md`

#### 3.3 Cross-Reference Pass
- **Owner**: Lint all docs for:
  - Broken links (docs referencing non-existent files)
  - Inconsistent terminology (use `addon` vs. `third-party module` consistently)
  - Version references (ensure v0.3.0+ is current)
  - Stale examples (commands that were removed, API changes)
- **Deliverable**: Updated links + frontmatter corrections in all pages

#### 3.4 Documentation Style Guide (`docs/STYLE-GUIDE.md`) — 80–100 lines
- **Owner**: Codify conventions used throughout
- **Contents**:
  - Frontmatter format (title, description, category)
  - Heading hierarchy (H1 = page title, H2 = sections, H3 = subsections)
  - Code block syntax (language tag, runnable vs. pseudo-code)
  - Examples (when to provide, commented walkthroughs)
  - Link format (cross-docs, external, GitHub source)
  - Diagrams (ASCII, SVG inline, when to use each)
  - Terminology (guild = server, user = Discord user, member = guild membership)
- **Deliverable**: `docs/STYLE-GUIDE.md`

---

## 4. Wave 10 Stubs & Structure

Ready-to-fill placeholders for critical missing docs:

### Create stub files with TODO structure:

```markdown
---
title: "Command Reference"
description: "Complete list of all Discord slash commands and prefix commands."
category: "User Guide"
---

# Command Reference

## Quick Navigation
- [Core Module](#core)
- [Moderation Module](#mod)
- [Filter Module](#filter)
- [Security Module](#security)
- [Logging Module](#logging)
- [AFK Module](#afk)
- [Temp VC Module](#tempvc)
- [Utility Module](#utility)

## Core Module

### /help
**Description**: TODO  
**Usage**: `/help`  
**Permissions**: None  
**Example**: TODO  

### /config
**Description**: TODO  
**Parameters**: `section` (string, optional)  
**Permissions**: `admin.config.read`  
**Example**: `/config moderation`

... (repeat for all commands)
```

### Output Structure
```
apps/docs/src/content/docs/
├── commands.md                          (NEW - Wave 10 Phase 1)
├── database-schema.md                   (NEW - Wave 10 Phase 2)
├── guides/
│   ├── dashboard-user-guide.md         (NEW - Wave 10 Phase 1)
│   ├── backup-restore.md               (NEW - Wave 10 Phase 1)
│   ├── monitoring-alerts.md            (NEW - Wave 10 Phase 1)
│   ├── module-patterns.md              (NEW - Wave 10 Phase 2)
│   ├── scaling-performance.md          (NEW - Wave 10 Phase 2)
│   ├── testing-strategy.md             (NEW - Wave 10 Phase 2)
│   └── (existing guides untouched)
├── rpc-actions.md                      (NEW - Wave 10 Phase 3)
├── troubleshooting.md                  (EXPAND - Wave 10 Phase 3)
└── (existing docs, minor updates)

docs/
├── DOCUMENTATION-AUDIT.md              (THIS FILE)
├── STYLE-GUIDE.md                      (NEW - Wave 10 Phase 3)
└── (existing audits)
```

---

## 5. Quality Gates & Verification

### Pre-Publication Checklist
- [ ] All docs pass link validation (no 404s to internal pages)
- [ ] Code examples are syntactically valid TypeScript
- [ ] Screenshots/diagrams are present for operational guides
- [ ] Cross-references updated (e.g., `commands.md` linked from `modules.md`)
- [ ] Terminology consistent (e.g., "addon" vs. "third-party module")
- [ ] Version references updated (e.g., v0.3.0)
- [ ] Frontmatter YAML valid (title, description, category)
- [ ] Linting passes (`prettier`, `markdownlint` if available)
- [ ] Read by non-author (spot-check for clarity)

### Post-Publication (Wave 11)
- [ ] User feedback (ask in Discord: "Can you find X in the docs?")
- [ ] Analytics (track most-visited pages, high bounce rate)
- [ ] Stale reference scan (grep for removed features)
- [ ] Performance audit (docs site load time)

---

## 6. Effort Estimates & Timeline

| Phase | Task | Lines | Hours | Duration |
| :--- | :--- | :---: | :---: | :--- |
| 1 | Command Reference | 300–400 | 8–10 | 3–4 days |
| 1 | Dashboard User Guide | 250–300 | 6–8 | 2–3 days |
| 1 | Monitoring & Alerts | 200–250 | 6–8 | 2–3 days |
| 1 | Backup & Restore | 150–200 | 4–6 | 1–2 days |
| **Phase 1 Subtotal** | | **900–1,150** | **24–32** | **8–12 days** |
| 2 | Module Patterns | 250–300 | 8–10 | 3–4 days |
| 2 | Scaling & Performance | 200–250 | 6–8 | 2–3 days |
| 2 | Testing Strategy | 250–300 | 8–10 | 3–4 days |
| 2 | Database Schema | 150–200 | 4–6 | 1–2 days |
| **Phase 2 Subtotal** | | **850–1,050** | **26–34** | **9–13 days** |
| 3 | Extended Troubleshooting | 200–250 | 4–6 | 1–2 days |
| 3 | RPC Actions | 150–200 | 4–6 | 1–2 days |
| 3 | Cross-Reference Pass | — | 4–6 | 1–2 days |
| 3 | Style Guide | 80–100 | 2–4 | 1 day |
| **Phase 3 Subtotal** | | **430–550** | **14–22** | **4–7 days** |
| **TOTAL** | | **2,180–2,750** | **64–88** | **21–32 days** |

**Parallel opportunities**:
- Phase 1.3 (Monitoring) can start once observability code is finalized
- Phase 2.3 (Testing) can start once test-strategy.md (Wave 9) is complete
- Phase 3 can start during Phase 2 for quick wins (RPC actions, style guide)

---

## 7. Dependencies & Blockers

### Before Wave 10 Starts
- [ ] Wave 9 (Testing) complete — reference `docs/test-strategy.md`
- [ ] `packages/contracts/src/rpc.ts` frozen — RPC actions count verified
- [ ] Dashboard feature-complete — no new RPC actions mid-documentation
- [ ] Observability code stable — monitoring setup documented

### During Wave 10
- [ ] Code review of examples (ensure they compile and run)
- [ ] Screenshots taken of web dashboard (UI consistency check)
- [ ] Team review of operator-facing docs (Monitoring, Backup, Scaling)

### Post Wave 10 (Wave 11)
- [ ] User testing (operator reads docs, tries setup, provides feedback)
- [ ] Analytics on docs site (identify confusing pages)
- [ ] Archive old docs (v0.2 or earlier, if applicable)

---

## 8. Success Criteria (Wave 10 Definition of Done)

When complete, a user should be able to:

### User/Admin
- [ ] Find every Discord command documented with usage examples
- [ ] Operate the web dashboard without reading source code
- [ ] Understand permission model and set up role-based access control

### Operator
- [ ] Set up production deployment (Docker Compose or Kubernetes)
- [ ] Configure monitoring + alerts for their infrastructure
- [ ] Back up and restore data without data loss
- [ ] Diagnose and resolve 80% of issues independently
- [ ] Scale horizontally (add more shards/replicas)
- [ ] Tune for performance (pool sizing, caching, rate limits)

### Developer/Addon Creator
- [ ] Build a new module following documented patterns
- [ ] Write unit/integration/E2E tests with examples
- [ ] Publish an addon to a registry
- [ ] Understand database schema and data relationships
- [ ] Call RPC actions from dashboard code
- [ ] Implement GDPR data deletion correctly

### Documentation Quality
- [ ] No orphaned pages or broken links
- [ ] Terminology consistent across all docs
- [ ] Every code example compiles (or marked hypothetical)
- [ ] Cross-references complete (pages link to related topics)
- [ ] Screenshots included for UI-heavy topics
- [ ] Troubleshooting section on every operational guide

---

## 9. Recommendations for Prioritization

If resources are limited, prioritize in this order:

1. **Command Reference** (users can't discover commands)
2. **Dashboard User Guide** (operators can't use the web UI)
3. **Monitoring & Alerts** (critical for production reliability)
4. **Module Patterns** (unblocks community addon development)
5. **Backup & Restore** (disaster recovery is non-negotiable for production)
6. Everything else (important but less blocking)

---

## 10. Next Steps (Wave 11 & Beyond)

### Wave 11 (Final Cleanup)
- [ ] User feedback integration (iterate on confusing pages)
- [ ] Deprecation notices for v0.2 docs (if applicable)
- [ ] Changelog entry summarizing Wave 10 additions

### Future Waves (Maintenance)
- [ ] Auto-generate command reference from code (reduce manual sync)
- [ ] Auto-generate RPC actions from `contracts/rpc.ts`
- [ ] Video tutorials (setup, addon development, common tasks)
- [ ] Contributor onboarding flow (first-timers guide)
- [ ] Glossary of terms (sharding, permit, module, addon, etc.)
- [ ] Architecture decision records (ADRs) for major design choices

---

## Appendix A: Existing Documentation Links

### Main Docs Site
https://lumi-devs.github.io/Lumi/  
(`apps/docs/src/content/docs/`)

### Key Docs
- Architecture: `/docs/architecture`
- Configuration: `/docs/configuration`
- Addon SDK: `/docs/api-reference`
- Production Deployment: `/docs/guides/production-deployment`
- FAQ: `/docs/faq`

### GitHub Docs
- README: `README.md`
- Contributing: `CONTRIBUTING.md`
- Security Policy: `SECURITY.md`
- Code of Conduct: `CODE_OF_CONDUCT.md`

---

## Appendix B: Related Wave 9 Documentation

**Wave 9 Output (Testing)**: `docs/test-strategy.md`  
Available for reference on:
- Unit testing Vitest patterns
- Mock strategies (Prisma, Discord)
- E2E testing with Vercel Agent Browser
- CI/CD test matrix

---

**Prepared by**: Claude Haiku 4.5  
**Date**: 2026-09-03  
**Status**: Ready for Wave 10 Kickoff  
**Next Review**: Upon Wave 10 completion
