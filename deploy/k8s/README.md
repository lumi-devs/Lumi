# ☸️ Lumi Kubernetes Deployment

<div align="center">
  <img src="https://img.shields.io/badge/Kubernetes-1.28+-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes">
  <img src="https://img.shields.io/badge/Architecture-Sharded_Workers-purple?style=for-the-badge" alt="Architecture">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
</div>

<br />

This directory contains production-ready **Kubernetes manifests** for deploying Lumi as a sharded worker fleet with a separate scheduler and a shared Discord REST proxy.

---

## 📖 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Prerequisites](#-prerequisites)
- [Kubernetes Manifests Reference](#-kubernetes-manifests-reference)
- [Deployment Sequence & Commands](#-deployment-sequence--commands)
- [Scaling Workers](#-scaling-workers)
- [Troubleshooting & Maintenance](#-troubleshooting--maintenance)

---

## 🌟 Overview & Architecture

Lumi runs as two application roles. There is no separate gateway process: each worker pod owns its own Discord WebSocket connection and runs command, module, and interaction logic in the same process.

- **`worker` (StatefulSet)**: Holds real Discord shards and runs all bot logic. StatefulSet, not Deployment, because each pod owns per-shard state (WebSocket session, sequence number). Replica count is a shard-assignment decision, not an autoscaler target — see [Scaling Workers](#-scaling-workers).
- **`scheduler` (Deployment)**: Single replica (or HA with the leader lock) owning BullMQ delayed job queues and task fire triggers. No Discord WebSocket.
- **`nirn-proxy` (Deployment)**: Stateless shared Discord REST proxy. Every worker replica routes its REST calls through it via `DISCORD_PROXY_URL` so per-route and global rate-limit buckets stay coordinated across pods.
- **`migrate` (Job)**: One-shot database migration (`bunx prisma migrate deploy`) run before application services start.

### Kubernetes Deployment Topology

```mermaid
flowchart TD
    subgraph External Services
        Discord[Discord Gateway / REST API]
        DB[(PostgreSQL 17 / PgBouncer)]
        Redis[(Redis 7)]
        Prometheus[Prometheus Server]
    end

    subgraph Kubernetes Cluster (Namespace: lumi)
        Job[migrate Job<br/>prisma migrate deploy]

        subgraph Worker Fleet
            W0[worker-0 StatefulSet Pod]
            W1[worker-1 StatefulSet Pod]
            WH[worker-headless Service<br/>Port 9090]
        end

        subgraph REST Layer
            NP[nirn-proxy Deployment<br/>Service :8080]
        end

        subgraph Scheduling Layer
            Sched[scheduler Deployment Pod]
        end

        PVC[(lumi-data PVC)]
    end

    Discord <-->|WebSocket| W0
    Discord <-->|WebSocket| W1
    NP -->|REST| Discord

    W0 -->|REST via DISCORD_PROXY_URL| NP
    W1 -->|REST via DISCORD_PROXY_URL| NP

    W0 <-->|Shard telemetry & session state| Redis
    W1 <-->|Shard telemetry & session state| Redis

    W0 <-->|Queries| DB

    Sched <-->|BullMQ Tasks| Redis
    Sched <-->|Sync State| DB

    Prometheus -->|Scrape /metrics| WH
    Prometheus -->|Scrape /metrics| Sched

    W0 <-->|Data Mount| PVC
    Sched <-->|Data Mount| PVC
```

---

## 📋 Prerequisites

1. **Kubernetes Cluster**: Version `1.28` or higher.
2. **`kubectl` CLI**: Installed and configured with cluster admin permissions.
3. **Prometheus Operator / Server**: Configured to scrape pods annotated with `prometheus.io/scrape: "true"`.
4. **External Data Plane**: PostgreSQL 17 (or PgBouncer) and Redis 7 deployed and reachable from inside the cluster. The dashboard talks to `worker` directly over an internal HTTP RPC port (`RPC_HTTP_PORT`, default 8091) — no message broker involved.

---

## 🗂️ Kubernetes Manifests Reference

| Manifest File | Kind | Name | Purpose |
|---|---|---|---|
| [`namespace.yaml`](./namespace.yaml) | `Namespace` | `lumi` | Isolated Kubernetes namespace for all Lumi components. |
| [`configmap.yaml`](./configmap.yaml) | `ConfigMap` | `lumi-env` | Non-sensitive environment configuration (endpoints, ports, log settings, `DISCORD_PROXY_URL`, `CLUSTER_NAME`, Redis cluster / replica options). |
| [`secret.example.yaml`](./secret.example.yaml) | `Secret` | `lumi-secrets` | Sensitive credential placeholders (`BOT_TOKEN`, database passwords, secret keys). |
| [`lumi-data-pvc.yaml`](./lumi-data-pvc.yaml) | `PersistentVolumeClaim` | `lumi-data` | Shared storage volume for persistent data and dynamic addons (`/app/data`). |
| [`migrate-job.yaml`](./migrate-job.yaml) | `Job` | `migrate` | Database migration job executing `bunx prisma migrate deploy`. |
| [`worker-statefulset.yaml`](./worker-statefulset.yaml) | `StatefulSet` + `Service` | `worker`, `worker-headless` | Sharded worker fleet with headless service for metrics discovery and shard 0 primary role. |
| [`dashboard-deployment.yaml`](./dashboard-deployment.yaml) | `Deployment` + `Service` | `dashboard` | Next.js admin dashboard web application (reaches worker RPC over `worker-0`). |
| [`nirn-proxy-deployment.yaml`](./nirn-proxy-deployment.yaml) | `Deployment` + `Service` | `nirn-proxy` | Shared Discord REST rate-limit proxy for the worker fleet. |

---

## 🚀 Deployment Sequence & Commands

> [!IMPORTANT]
> Copy `secret.example.yaml` to `secret.yaml` and populate real secrets (`BOT_TOKEN`, passwords, session secrets) before applying manifests.

### Step 1: Create Namespace & Secrets

```bash
kubectl apply -f namespace.yaml

cp secret.example.yaml secret.yaml
# (Edit secret.yaml with your credentials)

kubectl apply -f configmap.yaml -f secret.yaml
```

### Step 2: Storage & Migration

```bash
kubectl apply -f lumi-data-pvc.yaml
kubectl apply -f migrate-job.yaml
kubectl -n lumi wait --for=condition=complete job/migrate --timeout=120s
```

### Step 3: Deploy Applications

```bash
# 1. REST proxy first - workers read DISCORD_PROXY_URL at boot
kubectl apply -f nirn-proxy-deployment.yaml

# 2. Worker fleet (shard 0 assumes primary role for RPC & BullMQ)
kubectl apply -f worker-statefulset.yaml

# 3. Next.js Dashboard Frontend
kubectl apply -f dashboard-deployment.yaml
```

---

## 📈 Scaling Workers

Worker replica count is set manually, not by an autoscaler, and shard assignment is static: each replica is told which shard IDs it owns via `SHARD_LIST`, there is no runtime coordination between replicas. `CLUSTER_NAME` (already set in `configmap.yaml`) only namespaces the shard telemetry each replica publishes for the dashboard's fleet view.

- Scaling replica count means changing `SHARD_LIST` (and `CLUSTER_REPLICAS`/`TOTAL_SHARDS` if applicable) for the affected pods and restarting them — there is no in-place rebalance path. Size it by picking a shards-per-replica target (start around 16–32) and dividing the total shard count by it.
- Rolling updates use `maxUnavailable: 1` so at most one shard range is offline at a time; each replacement pod spends a fresh IDENTIFY on restart.

```bash
kubectl -n lumi scale statefulset/worker --replicas=4
```

Watch `shardLatency`, `shardStatus`, `guildCount`, and `rest429Total` in Prometheus when tuning.

---

## 🔧 Troubleshooting & Maintenance

### Viewing Pod Logs

```bash
kubectl -n lumi logs -l app=worker --tail=100 -f
kubectl -n lumi logs -l app=scheduler --tail=100 -f
kubectl -n lumi logs -l app=nirn-proxy --tail=100 -f
```

### Force Database Migration Re-run

```bash
kubectl -n lumi delete job migrate
kubectl apply -f migrate-job.yaml
```

### Graceful Restart of Workers

```bash
kubectl -n lumi rollout restart statefulset/worker
```
