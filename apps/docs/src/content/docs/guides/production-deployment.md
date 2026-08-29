---
title: "Production Deployment Guide"
description: "Production topology, Kubernetes orchestration, Docker Compose stacks, and high availability."
category: "Operations & Runbooks"
---

# Production Deployment Guide

This guide covers deploying Lumi to production environments using Docker Compose or Kubernetes, configuring high availability, connection pooling, and monitoring.

## System Topology Overview

```
                          Internet / Discord Gateway
                                      │
                   ┌──────────────────┴──────────────────┐
                   │                                     │
                   ▼                                     ▼
        ┌──────────────────────┐              ┌──────────────────────┐
        │ worker-0 (Pod/Replica)│              │ worker-1 (Pod/Replica)│
        │ • Shards: [0, 1]     │              │ • Shards: [2, 3]     │
        │ • RPC Server (:8091) │              │ • Gateway Client     │
        │ • Metrics (:9090)    │              │ • Streams Consumer   │
        │ • BullMQ Scheduler   │              └──────────┬───────────┘
        └──────────┬───────────┘                         │
                   │                                     │
                   ├──────────────────┬──────────────────┤
                   ▼                  ▼                  ▼
        ┌──────────────────┐ ┌─────────────────┐ ┌──────────────────┐
        │  PgBouncer (6432)│ │  Redis (6379)   │ │  Dashboard (8080)│
        │  └► Postgres (5432)│ │  DB0: Cache   │ │  Talks to worker0│
        └──────────────────┘ │  DB1: BullMQ    │ └──────────────────┘
                             │  Stream: Events │
                             └─────────────────┘
```

The split to understand:
- **`worker-0`**: Holds Shard ID `0` and is elected the primary shard (`isPrimaryShard()` in `packages/core/src/lib/env.ts`). It owns the singleton roles: running BullMQ cron scheduling, binding the internal RPC HTTP server (`RPC_HTTP_PORT`, default `8091`), and serving Prometheus `/metrics` (`METRICS_PORT`, default `9090`).
- **`worker-1..N`**: Additional shard replicas. They connect to the Discord gateway for their assigned shard slice, execute commands and listeners in-process, and consume task-fire effects from the Redis Streams bus. They do not bind HTTP ports.
- **`dashboard`**: The Next.js web admin panel (`apps/dashboard`). Connects to `worker-0` over plain HTTP RPC (`POST /rpc`) to read/write state. Holds no bot token, has no direct database connection, and never touches Redis.
- **`pgbouncer`**: Sits in front of PostgreSQL in transaction pooling mode on port `6432`. Every worker container talks to PgBouncer; only migrations talk to PostgreSQL directly on port `5432`.

---

## 1. Docker Compose Production Deployment

A production-ready `docker-compose.prod.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-lumi}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-lumi}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-lumi}"]
      interval: 5s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: edoburu/pgbouncer:v1.22.0
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_USER: ${POSTGRES_USER:-lumi}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${POSTGRES_DB:-lumi}
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
      RESERVE_POOL_SIZE: 5
    ports:
      - "127.0.0.1:6432:5432"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  worker:
    image: ghcr.io/lumi-devs/worker:latest
    restart: unless-stopped
    depends_on:
      pgbouncer:
        condition: service_started
      redis:
        condition: service_healthy
    env_file: .env.production
    environment:
      POSTGRES_URL: "postgresql://${POSTGRES_USER:-lumi}:${POSTGRES_PASSWORD}@pgbouncer:5432/${POSTGRES_DB:-lumi}?pgbouncer=true"
      DIRECT_POSTGRES_URL: "postgresql://${POSTGRES_USER:-lumi}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-lumi}"
      REDIS_URL: "redis://redis:6379/0"
      REDIS_TASK_URL: "redis://redis:6379/1"
      TOTAL_SHARDS: "auto"
      RPC_HTTP_PORT: 8091
      METRICS_PORT: 9090
    ports:
      - "127.0.0.1:9090:9090"

  dashboard:
    image: ghcr.io/lumi-devs/dashboard:latest
    restart: unless-stopped
    depends_on:
      - worker
    env_file: .env.production
    environment:
      RPC_HTTP_URL: "http://worker:8091"
      DASHBOARD_PORT: 8080
    ports:
      - "127.0.0.1:8080:8080"

volumes:
  postgres_data:
  redis_data:
```

---

## 2. Kubernetes Deployment

### Worker StatefulSet (`worker-statefulset.yaml`)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: worker
  namespace: lumi
spec:
  serviceName: worker-headless
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/lumi-devs/worker:latest
          envFrom:
            - secretRef:
                name: lumi-secrets
          env:
            - name: POD_INDEX
              valueFrom:
                fieldRef:
                  fieldPath: metadata.labels['apps.kubernetes.io/pod-index']
            - name: TOTAL_SHARDS
              value: "4"
            - name: RPC_HTTP_PORT
              value: "8091"
            - name: METRICS_PORT
              value: "9090"
          ports:
            - name: rpc
              containerPort: 8091
            - name: metrics
              containerPort: 9090
          livenessProbe:
            httpGet:
              path: /healthz
              port: metrics
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: metrics
            initialDelaySeconds: 10
            periodSeconds: 5
```

### Dashboard Deployment (`dashboard-deployment.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard
  namespace: lumi
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dashboard
  template:
    metadata:
      labels:
        app: dashboard
    spec:
      containers:
        - name: dashboard
          image: ghcr.io/lumi-devs/dashboard:latest
          envFrom:
            - secretRef:
                name: lumi-secrets
          env:
            - name: RPC_HTTP_URL
              value: "http://worker-0.worker-headless.lumi.svc.cluster.local:8091"
            - name: DASHBOARD_PORT
              value: "8080"
          ports:
            - name: http
              containerPort: 8080
```

---

## 3. Database Maintenance & Backups

### Regular PostgreSQL Snapshots

```bash
# Snapshot to compressed archive
pg_dump -h 127.0.0.1 -p 5432 -U lumi -Fc lumi > "lumi_backup_$(date +%Y%m%d_%H%M%S).dump"

# Restore from snapshot
pg_restore -h 127.0.0.1 -p 5432 -U lumi -d lumi -c "lumi_backup_20260829.dump"
```

### Applying Migrations in Production

Before rolling out new worker versions, apply pending Prisma schema migrations:

```bash
bun run db:migrate
```


