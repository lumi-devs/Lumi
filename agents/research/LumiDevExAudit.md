# Lumi v2 Developer Experience Audit

**Date**: 2026-11-14  
**Scope**: Full architectural audit of tooling, setup, CI, testing, and documentation  
**Repository**: `/home/rebiz/opt/workdir/lumi-v2`

---

## Executive Summary

Lumi v2 has a solid foundation with Bun monorepo, Docker Compose, Nix dev shell, and comprehensive agent documentation. However, significant gaps exist in **readiness probing**, **seed data**, **integration testing**, **e2e/load testing**, **dependency auditing**, and **common command ergonomics** (no Makefile/Taskfile).

---

## 1. Docker Compose (`docker-compose.yml`)

### Current State
- **Services**: postgres:18-alpine, redis:8-alpine, bot, dashboard, migrate (profile)
- **Healthchecks**: Each service has basic healthchecks (`pg_isready`, `redis-cli ping`)
- **Dependencies**: `depends_on` with `condition: service_healthy` for postgres/redis; bot uses `service_started` for dashboard
- **Ports**: All bound to `127.0.0.1` (localhost only)
- **Profiles**: `migrate` profile for one-shot migrations

### Gaps
| Gap | Impact | File/Location |
|-----|--------|---------------|
| **No aggregated health endpoint** | Cannot query overall stack health from load balancer/orchestrator | `docker-compose.yml` — no `healthcheck` on compose level or dedicated aggregator service |
| **No readiness probes distinct from liveness** | K8s/Docker Swarm cannot distinguish "starting" from "healthy but not ready" | Bot has `/ready` and `/healthz` (`src/core/rpcRoutes.ts:603-618`) but Compose doesn't expose readiness separately |
| **Dashboard depends on `bot:service_started` not `service_healthy`** | Dashboard may start before bot RPC is actually ready | `docker-compose.yml:98-99` |
| **No init containers for migrations** | Race condition: bot may start before migrations apply | `migrate` profile is separate, not enforced before `bot` |
| **No resource limits/reservations** | Unbounded memory/CPU in production | `docker-compose.yml` — missing `deploy.resources` |
| **No logging driver config** | Default json-file driver fills disk | `docker-compose.yml` — missing `logging` section |
| **No secrets management** | Passwords in `.env` file, not Docker secrets | `docker-compose.yml:19,37,74` use `${VAR:?}` but no `secrets:` |

### Recommendations
1. Add `healthcheck` to `bot` service using `/readyz` endpoint (distinct from `/healthz`)
2. Change dashboard `depends_on` to `condition: service_healthy` for bot
3. Add `init: true` containers or use `depends_on` with `condition: service_completed_successfully` for migrate (requires Compose v2.29+)
4. Add `deploy.resources.limits` and `reservations`
5. Add `logging: { driver: "json-file", options: { max-size: "10m", max-file: "3" } }`
6. Consider Docker secrets for `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `RPC_INTERNAL_TOKEN`

---

## 2. Setup Script (`scripts/setup.sh`)

### Current State
- Idempotent: creates `.env` from `.env.example` if missing
- Generates random secrets (Postgres, Redis, RPC token) using `openssl rand` or fallback
- Starts PostgreSQL and Redis via `docker compose up -d postgres redis`
- Waits for health using `pg_isready` and `redis-cli ping` loops
- Runs `prisma migrate deploy` then `prisma generate`
- Outputs next steps

### Gaps
| Gap | Impact | File/Location |
|-----|--------|---------------|
| **No seed data support** | Fresh dev environment has empty database — no guilds, modules, or test data | `scripts/setup.sh:42-46` — only runs migrations |
| **No verify step** | No validation that bot can actually connect to Discord or that config is valid | `scripts/setup.sh:48-51` — only prints next steps |
| **No `--seed` flag** | Cannot populate dev data for manual testing | N/A |
| **No `--check-only` / `--dry-run`** | `setup:check` exists in package.json but not implemented in script | `package.json:19` references `scripts/setup.ts --check` but `setup.sh` has no such flag |
| **Hardcoded Docker Compose** | Cannot use external Postgres/Redis without `--no-docker` (which isn't implemented) | `scripts/setup.sh:34` — always uses Docker |
| **No Bun version check** | May fail silently if wrong Bun version | `scripts/setup.sh` — no version validation |

### Note
There's also a `scripts/setup.ts` referenced in `package.json:18-19` but `scripts/setup.sh` is the one documented in SETUP.md. These may be out of sync.

### Recommendations
1. Add `--seed` flag to run a seed script (e.g., `bun run db:seed`) after migrations
2. Add `--verify` flag that runs `bun run setup:check` logic: validates Discord connectivity, RPC health, cache invalidation
3. Implement `setup:check` in TypeScript (`scripts/setup.ts`) for better maintainability
4. Support external DB/Redis via `--database-url` and `--redis-url` flags (partially documented in SETUP.md but not in script)
5. Add Bun version check: `bun --version` must satisfy `engines.bun` from package.json

---

## 3. Dev Script (`scripts/dev.sh`)

### Current State
- Flags: `--build`, `--logs`, `--migrate`
- `--build`: runs `docker compose build`
- `--migrate`: runs `docker compose --profile migrate run --rm migrate`
- `--logs`: runs `docker compose up` (foreground); otherwise `docker compose up -d`
- Validates `.env` exists

### Gaps
| Gap | Impact | File/Location |
|-----|--------|---------------|
| **No `--reset` / `--clean`** | Cannot easily nuke volumes and restart fresh | `scripts/dev.sh` |
| **No `--detach` default** | Default is `-d` but no explicit flag for clarity | `scripts/dev.sh:40-42` |
| **No service selection** | Cannot start just bot, or just dashboard | `scripts/dev.sh:38-43` |
| **No `--pull`** | Cannot pull latest images before starting | `scripts/dev.sh` |
| **No `--tail` / `-f` log filtering** | `docker compose logs -f` shows all services; no per-service flag | `scripts/dev.sh:43` |
| **No hot-reload for bot** | Docker mode doesn't support file watching; must use `bun run dev:bot` locally | `scripts/dev.sh` — runs prebuilt images |

### Recommendations
1. Add `--reset` flag: `docker compose down -v && docker compose up -d`
2. Add `--services` flag to select subset: `docker compose up -d bot postgres redis`
3. Add `--pull` flag: `docker compose pull` before up
4. Add `--tail SERVICE` to follow specific service logs
5. Document local hot-reload workflow (`bun run dev:bot` + `bun run dashboard:dev`) vs Docker workflow

---

## 4. CI Pipeline (`.github/workflows/ci.yml`)

### Current State
**Jobs**: `lint-and-typecheck`, `unit-tests`, `build`, `load-tests` (scheduled/releases), `docker`, `security-scan`, `dependency-update` (scheduled)

**Tools**: Biome (lint), Prettier (format), TypeScript (typecheck), Vitest (unit), Trivy (vuln scan), `bun audit`, `bun outdated`

### Gaps
| Gap | Impact | File/Location |
|-----|--------|---------------|
| **No e2e tests** | No validation of full bot→Discord→dashboard flows | `.github/workflows/ci.yml` — only unit tests |
| **No contract tests** | RPC API contracts between dashboard and bot not verified | `.github/workflows/ci.yml` — no Pact or similar |
| **Load tests only scheduled** | Load tests run weekly/releases only, not on PR | `.github/workflows/ci.yml:110-114` — `if: github.event_name == 'schedule' \|\| github.event_name == 'release'` |
| **No dependency audit in PR** | `bun audit` only in `security-scan` job (not required) | `.github/workflows/ci.yml:196-218` — security-scan not required by build |
| **No PR size/complexity checks** | Large PRs can merge without review | N/A |
| **No semantic release / version bump automation** | Manual version management | N/A |
| **No Docker image vulnerability scan in PR** | Trivy scans filesystem only, not built image | `.github/workflows/ci.yml:203-209` — `scan-type: "fs"` |
| **No integration test job** | Database-backed tests need Postgres/Redis but CI only has them for `lint-and-typecheck` | `.github/workflows/ci.yml:44-45` — DATABASE_URL only for Prisma generate |

### Recommendations
1. Add `integration-tests` job: start Postgres/Redis services, run `vitest run tests/integration` (needs testcontainers or GitHub service containers)
2. Add `contract-tests` job: verify RPC schema compatibility between bot and dashboard
3. Run `load-tests` on PRs with `LOAD_TEST_DURATION: 30000` (30s smoke)
4. Make `security-scan` required: add `needs: security-scan` to `build` job
5. Add Trivy image scan: `scan-type: "image"` on built Docker image
6. Add `bun audit --audit-level=high` to `lint-and-typecheck` job (fail PR on high vulns)
7. Add PR checks: `actions/labeler` for size, `github-script` for complexity

---

## 5. Testing (`vitest.config.ts`, test files)

### Current State
- **Runner**: Vitest via `bun run test`
- **Config**: `vitest.config.ts` includes `tests/**`, `packages/*/tests/**`, `modules/**/tests/**`, `apps/*/tests/**`
- **Test Files Found** (via glob):
  - `packages/module-kit/tests/lock.test.ts`
  - `packages/module-runtime/tests/dependencies.test.ts`, `manifest.test.ts`
  - `packages/downloader/tests/validate.test.ts`, `repo-name.test.ts`
  - `tests/unit/module-host.test.ts`, `module-manager.test.ts`, `panel-modules.test.ts`, `rpc-module-state.test.ts`
  - `apps/dashboard/tests/module-config.test.ts`

### Gaps
| Gap | Impact | File/Location |
|-----|--------|---------------|
| **No integration tests** | No tests with real Postgres/Redis | `vitest.config.ts:21-22` — excludes `data/repos/**` but no integration suite |
| **No contract tests** | RPC API between dashboard↔bot not tested | N/A |
| **No e2e browser tests** | Dashboard UI flows untested | `agents/dashboard.md:181` — "there is no browser test runner in the repository" |
| **No load/stress tests in CI** | Load tests exist but only scheduled | `.github/workflows/ci.yml:132-133` — `bun run test tests/load` but `tests/load/` not found |
| **No test fixtures for modules** | Module loading tested but with minimal fixtures | `tests/unit/module-host.test.ts` etc. |
| **No dashboard component tests** | Svelte components untested | `apps/dashboard/tests/` only has `module-config.test.ts` |
| **No mutation testing** | Test quality unknown | N/A |

### Test Coverage Gaps by Area
| Area | Unit Tests | Integration | Contract | E2E |
|------|------------|-------------|----------|-----|
| Cache (`@lumi/cache`) | ❌ (only `cache.test.ts` referenced in `agents/testing.md` but not found) | ❌ | N/A | N/A |
| Redis invalidation | ❌ | ❌ | N/A | N/A |
| Module loader | ✅ (`module-host`, `module-manager`) | ❌ | ❌ | ❌ |
| Downloader | ✅ (`validate`, `repo-name`) | ❌ | ❌ | ❌ |
| Dashboard routes | ❌ | ❌ | ❌ | ❌ |
| RPC routes | ✅ (`rpc-module-state`) | ❌ | ❌ | ❌ |
| Permits/cron | ❌ | ❌ | N/A | N/A |
| Dashboard UI | ❌ | N/A | N/A | ❌ |

### Recommendations
1. Create `tests/integration/` with `TEST_DATABASE_URL` gating (per `agents/testing.md:29-35`)
2. Add contract tests using `zod` schemas shared between bot/dashboard for RPC
3. Add Playwright for dashboard e2e tests (`apps/dashboard/tests/e2e/`)
4. Create `tests/load/` for k6 or artillery load tests
5. Add `@lumi/cache` tests per `agents/testing.md:14-25` (L1 hit, Redis hit, negative caching, single-flight, invalidation during load, TTL jitter, LRU, codec round-trip)
6. Add component tests for Svelte using `@testing-library/svelte` or Vitest component testing

---

## 6. Documentation (`agents/`, `README.md`, `SETUP.md`, `AGENTS.md`)

### Current State
**agents/00-index.md** lists 28 docs covering architecture, services, cache, db, redis, modules, module-data, downloader, commands, permissions, tickets, role-menus, role-automation, reminders, stats, dashboard, verification-web, ui, testing, conventions, operations, module-dev-guide, addon-dev-guide, migration-guide.

### Gaps
| Missing Doc | Needed For | Evidence |
|-------------|------------|----------|
| **caching.md** (deep dive) | Cache invalidation patterns, L1/L2 interaction, metrics | `agents/cache.md` exists but is high-level; no guide for "adding a new cached read" |
| **rpc.md** | Adding new RPC endpoints, auth, versioning | `agents/dashboard.md:109-143` has RPC contract but no standalone guide |
| **deployment.md** | Production deploy, TLS, reverse proxy, scaling | `agents/operations.md` covers local only; `SETUP.md` has systemd but no K8s/Compose prod |
| **observability.md** | Metrics, logging, tracing, alerting | `agents/operations.md:73-87` lists metrics but no guide for adding new ones |
| **security.md** | Threat model, secret handling, addon sandboxing | `AGENTS.md:29-31` mentions addon security but no dedicated doc |
| **migrations.md** | Prisma migration workflow, naming, rollback | `agents/db.md` likely covers but not in index |
| **local-dev.md** | Hot reload, debugging, VS Code config | `SETUP.md` has setup but not day-to-day dev loop |

### Existing Doc Quality Issues
| Doc | Issue |
|-----|-------|
| `agents/testing.md` | References `packages/cache/tests/cache.test.ts` which doesn't exist |
| `agents/dashboard.md` | Mentions "no browser test runner" — should be a known gap tracked elsewhere |
| `agents/operations.md` | Metrics declared but "not yet instrumented" (lines 80-81) — should be tracked as TODO |

### Recommendations
1. Create `agents/caching.md` with step-by-step: "How to add a cached config read", "How to invalidate on write"
2. Create `agents/rpc.md` with: endpoint registration, auth patterns, versioning, testing
3. Create `agents/deployment.md`: Docker Compose prod, K8s manifests, TLS termination, scaling bot (stateless), dashboard (sticky sessions for OAuth)
4. Create `agents/observability.md`: adding metrics, log structure, tracing (OpenTelemetry?), alerting rules
5. Create `agents/security.md`: threat model, secret rotation, addon isolation, supply chain
6. Fix `agents/testing.md` reference to non-existent `cache.test.ts`
7. Add "Known Gaps" section to `agents/00-index.md` or a `ROADMAP.md`

---

## 7. Missing Makefile/Taskfile for Common Commands

### Current State
**No Makefile, Taskfile.yml, justfile, or similar**. Common commands scattered across:
- `package.json` scripts (root + dashboard)
- `scripts/setup.sh`, `scripts/dev.sh`
- `docker-compose.yml` profiles
- `README.md` "Development" section
- `SETUP.md` various platform sections
- `AGENTS.md` "Verification" section

### Command Mapping (What Developers Need vs Where It Lives)

| Task | Current Command | Location |
|------|-----------------|----------|
| Full setup (deps + DB + migrate) | `bun run setup` | `package.json:18` / `scripts/setup.sh` |
| Check config only | `bun run setup:check` | `package.json:19` (not implemented in `.sh`) |
| Start all (Docker) | `./scripts/dev.sh` | `scripts/dev.sh` |
| Start all + build | `./scripts/dev.sh --build` | `scripts/dev.sh` |
| Start all + migrate | `./scripts/dev.sh --migrate` | `scripts/dev.sh` |
| Start bot only (local) | `bun run dev:bot` | `package.json:25` |
| Start dashboard only | `bun run dashboard:dev` | `package.json:26` |
| Run migrations | `bun run db:migrate:deploy` | `package.json:22` |
| Generate Prisma client | `bun run db:generate` | `package.json:20` |
| Typecheck all | `bun run typecheck` + `bun run dashboard:typecheck` | `package.json:10,29` |
| Lint all | `bun run lint` | `package.json:11` |
| Format all | `bun run format` | `package.json:13` |
| Run tests | `bun run test` | `package.json:15` |
| Build bot | `bun run build` | `package.json:24` |
| Build dashboard | `bun run dashboard:build` | `package.json:28` |
| Docker build + push | `docker compose build` + manual push | Manual |
| Run migrations (Docker) | `docker compose --profile migrate run --rm migrate` | `docker-compose.yml:108-118` |
| View logs | `docker compose logs -f` | Manual |
| Clean reset (Docker) | `docker compose down -v` | Manual |

### Recommendations
Create a **`Taskfile.yml`** (preferred over Makefile for cross-platform) with:

```yaml
version: '3'

vars:
  BUN: 'bun'
  COMPOSE: 'docker compose'

tasks:
  # Setup
  setup:
    desc: "Full first-time setup (deps, .env, DB, migrate)"
    cmds:
      - "{{.BUN}} install"
      - "{{.BUN}} run setup"

  setup-check:
    desc: "Validate config without writing"
    cmds:
      - "{{.BUN}} run setup:check"

  # Docker stack
  up:
    desc: "Start full stack (Docker)"
    cmds:
      - "{{.COMPOSE}} up -d"

  up-build:
    desc: "Build images and start stack"
    cmds:
      - "{{.COMPOSE}} build"
      - "{{.COMPOSE}} up -d"

  up-migrate:
    desc: "Run migrations then start stack"
    cmds:
      - "{{.COMPOSE}} --profile migrate run --rm migrate"
      - "{{.COMPOSE}} up -d"

  down:
    desc: "Stop stack"
    cmds:
      - "{{.COMPOSE}} down"

  reset:
    desc: "Nuke volumes and restart fresh"
    cmds:
      - "{{.COMPOSE}} down -v"
      - "{{.COMPOSE}} up -d"

  logs:
    desc: "Follow all logs"
    cmds:
      - "{{.COMPOSE}} logs -f"

  logs-bot:
    desc: "Follow bot logs"
    cmds:
      - "{{.COMPOSE}} logs -f bot"

  # Local dev (hot reload)
  dev-bot:
    desc: "Run bot with file watching"
    cmds:
      - "{{.BUN}} run dev:bot"

  dev-dashboard:
    desc: "Run dashboard with HMR"
    cmds:
      - "{{.BUN}} run dashboard:dev"

  # Database
  migrate:
    desc: "Run Prisma migrations (dev)"
    cmds:
      - "{{.BUN}} run db:migrate"

  migrate-deploy:
    desc: "Apply migrations (prod/CI)"
    cmds:
      - "{{.BUN}} run db:migrate:deploy"

  generate:
    desc: "Generate Prisma client"
    cmds:
      - "{{.BUN}} run db:generate"

  studio:
    desc: "Open Prisma Studio"
    cmds:
      - "{{.BUN}} run db:studio"

  # Quality
  typecheck:
    desc: "Typecheck bot and dashboard"
    cmds:
      - "{{.BUN}} run typecheck"
      - "{{.BUN}} run dashboard:typecheck"

  lint:
    desc: "Lint all"
    cmds:
      - "{{.BUN}} run lint"

  format:
    desc: "Format all"
    cmds:
      - "{{.BUN}} run format"

  test:
    desc: "Run unit tests"
    cmds:
      - "{{.BUN}} run test"

  test-watch:
    desc: "Run tests in watch mode"
    cmds:
      - "{{.BUN}} run test:watch"

  # Build
  build:
    desc: "Build bot for production"
    cmds:
      - "{{.BUN}} run build"

  build-dashboard:
    desc: "Build dashboard for production"
    cmds:
      - "{{.BUN}} run dashboard:build"

  # Docker images
  docker-build:
    desc: "Build Docker images"
    cmds:
      - "{{.COMPOSE}} build"

  docker-push:
    desc: "Push Docker images (requires auth)"
    cmds:
      - "{{.COMPOSE}} push"

  # CI simulation
  ci:
    desc: "Run local CI checks (typecheck, lint, test, build)"
    deps: [typecheck, lint, test, build, build-dashboard]

  default:
    desc: "Show available tasks"
    cmds:
      - task --list
```

---

## Summary of Critical Gaps (Priority Order)

| Priority | Area | Gap | Effort |
|----------|------|-----|--------|
| **P0** | Docker Compose | No readiness probes; dashboard depends on `service_started` not `service_healthy` | Low |
| **P0** | Setup | No verify step; no seed data for dev | Medium |
| **P1** | CI | No integration tests; no contract tests; security-scan not required | High |
| **P1** | Testing | No integration/e2e/contract/load tests; cache tests missing | High |
| **P1** | Docs | Missing caching, RPC, deployment, observability, security guides | Medium |
| **P2** | Dev Script | No `--reset`, `--services`, `--pull`, per-service logs | Low |
| **P2** | Tooling | No Makefile/Taskfile for common commands | Low |
| **P3** | CI | Load tests only scheduled; no image vuln scan; no PR checks | Medium |

---

## File References

- `docker-compose.yml` — Infrastructure orchestration
- `scripts/setup.sh` — Environment bootstrap
- `scripts/dev.sh` — Development stack launcher
- `package.json` (root) — Bot scripts
- `apps/dashboard/package.json` — Dashboard scripts
- `.github/workflows/ci.yml` — CI/CD pipeline
- `vitest.config.ts` — Test configuration
- `flake.nix` — Nix development shell
- `agents/00-index.md` — Documentation index
- `agents/cache.md` — Caching documentation
- `agents/testing.md` — Testing guidelines
- `agents/operations.md` — Operations/deployment
- `agents/dashboard.md` — Dashboard architecture
- `SETUP.md` — Setup guide
- `README.md` — Project overview
- `AGENTS.md` — Agent operating spec
- `Dockerfile` / `apps/dashboard/Dockerfile` — Container images
- `src/core/rpcRoutes.ts:603-618` — Health/ready endpoints