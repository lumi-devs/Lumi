# ☸️ Lumi Kubernetes Deployment

<div align="center">
  <img src="https://img.shields.io/badge/Kubernetes-1.28+-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes">
  <img src="https://img.shields.io/badge/Autoscaling-KEDA_v2.13+-FF69B4?style=for-the-badge" alt="KEDA">
  <img src="https://img.shields.io/badge/Architecture-Distributed-purple?style=for-the-badge" alt="Architecture">
  <img src="https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=for-the-badge" alt="Status">
</div>

<br />

This directory contains production-ready **Kubernetes manifests** for deploying Lumi in a horizontally scaled, event-driven microservices architecture using **KEDA (Kubernetes Event-driven Autoscaling)** and **Prometheus**.

---

## 📖 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Prerequisites](#-prerequisites)
- [Kubernetes Manifests Reference](#-kubernetes-manifests-reference)
- [Deployment Sequence & Commands](#-deployment-sequence--commands)
- [Autoscaling & KEDA Verification](#-autoscaling--keda-verification)
- [Troubleshooting & Maintenance](#-troubleshooting--maintenance)

---

## 🌟 Overview & Architecture

In Kubernetes, Lumi decomposes into discrete, specialized workloads rather than running as a single monolith:

- **`gateway` (StatefulSet)**: Manages Discord WebSocket connections and pre-defers interaction payloads. Uses a StatefulSet to maintain predictable pod identity for shard clustering.
- **`worker` (Deployment)**: Executes stateless bot commands, module logic, and event handling. Autoscaled elastically by KEDA between 2 and 20 pods based on Redis Stream consumer lag.
- **`scheduler` (Deployment)**: Runs as a single replica (or HA leader-locked setup) managing BullMQ delayed job queues and task fire triggers.
- **`migrate` (Job)**: Executes one-shot database schema synchronization (`bunx prisma db push`) prior to launching application services.

### Kubernetes Deployment Topology

```mermaid
flowchart TD
    subgraph External Services
        Discord[Discord Gateway / REST API]
        DB[(PostgreSQL 17 / PgBouncer)]
        Redis[(Redis 7 Cluster)]
        RMQ[RabbitMQ Broker]
        Prometheus[Prometheus Server]
    end

    subgraph Kubernetes Cluster (Namespace: lumi)
        Job[migrate Job<br/>prisma db push]

        subgraph Ingestion Layer
            GW0[gateway-0 StatefulSet Pod]
            GW1[gateway-1 StatefulSet Pod]
            GWH[gateway-headless Service<br/>Port 9090]
        end

        subgraph Processing Layer
            W1[worker Deployment Pod 1]
            W2[worker Deployment Pod 2]
            WN[worker Deployment Pod N...]
            KEDA[KEDA ScaledObject<br/>min: 2, max: 20]
        end

        subgraph Scheduling Layer
            Sched[scheduler Deployment Pod]
        end

        PVC[(lumi-data PVC<br/>Persistent Volume Claim)]
    end

    Discord <-->|WS / REST| GW0
    Discord <-->|WS / REST| GW1

    GW0 -->|Publish Events| Redis
    GW1 -->|Publish Events| Redis

    Redis -->|Stream Events| W1
    Redis -->|Stream Events| W2
    Redis -->|Stream Events| WN

    Prometheus -->|Scrape /metrics| GWH
    Prometheus -->|Scrape /metrics| W1
    Prometheus -->|Scrape /metrics| Sched

    KEDA -->|Query stream_consumer_lag| Prometheus
    KEDA -->|Autoscale Replicas| W1

    Sched <-->|BullMQ Tasks| Redis
    Sched <-->|Sync State| DB

    W1 <-->|Data Mount| PVC
    WN <-->|Data Mount| PVC
```

---

## 📋 Prerequisites

Before deploying Lumi to Kubernetes, verify that your cluster meets the following requirements:

1. **Kubernetes Cluster**: Version `1.28` or higher.
2. **`kubectl` CLI**: Installed and configured with cluster admin permissions.
3. **KEDA (v2.13+)**: Installed in the cluster. Verify CRD availability:
   ```bash
   kubectl get crd scaledobjects.keda.sh
   ```
4. **Prometheus Operator / Server**: Deployed and configured to scrape pods annotated with `prometheus.io/scrape: "true"`.
5. **External Data Plane**: PostgreSQL 17 (or PgBouncer), Redis 7, and RabbitMQ must be deployed and reachable from inside the cluster.

---

## 🗂️ Kubernetes Manifests Reference

| Manifest File | Kind | Name | Purpose |
|---|---|---|---|
| [`namespace.yaml`](./namespace.yaml) | `Namespace` | `lumi` | Isolated Kubernetes namespace for all Lumi components. |
| [`configmap.yaml`](./configmap.yaml) | `ConfigMap` | `lumi-env` | Non-sensitive environment configuration (endpoints, ports, log settings). |
| [`secret.example.yaml`](./secret.example.yaml) | `Secret` | `lumi-secrets` | Sensitive credential placeholders (`BOT_TOKEN`, database passwords, secret keys). |
| [`lumi-data-pvc.yaml`](./lumi-data-pvc.yaml) | `PersistentVolumeClaim` | `lumi-data` | Shared storage volume for persistent data and dynamic addons (`/app/data`). |
| [`migrate-job.yaml`](./migrate-job.yaml) | `Job` | `lumi-migrate` | Database migration job executing `bunx prisma db push --accept-data-loss`. |
| [`gateway-statefulset.yaml`](./gateway-statefulset.yaml) | `StatefulSet` + `Service` | `gateway`, `gateway-headless` | Sharded gateway pod pool with headless service for metrics discovery. |
| [`scheduler-deployment.yaml`](./scheduler-deployment.yaml) | `Deployment` | `scheduler` | Task scheduler managing BullMQ queues (uses `Recreate` deployment strategy). |
| [`worker-deployment.yaml`](./worker-deployment.yaml) | `Deployment` | `worker` | Elastic worker deployment executing commands (`RollingUpdate` strategy). |
| [`worker-scaledobject.yaml`](./worker-scaledobject.yaml) | `ScaledObject` | `worker` | KEDA autoscaler configuration scaling worker pods based on stream consumer lag. |

---

## 🚀 Deployment Sequence & Commands

> [!IMPORTANT]
> Copy `secret.example.yaml` to `secret.yaml` and populate real secrets (`BOT_TOKEN`, passwords, session secrets) before applying manifests.

### Step 1: Create Namespace & Secrets

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Copy and edit secret configuration
cp secret.example.yaml secret.yaml
# (Edit secret.yaml with your credentials)

# Apply ConfigMap and Secret
kubectl apply -f configmap.yaml -f secret.yaml
```

### Step 2: Storage & Migration

```bash
# Apply PVC
kubectl apply -f lumi-data-pvc.yaml

# Run database migration job
kubectl apply -f migrate-job.yaml

# Wait for migration job to complete successfully
kubectl -n lumi wait --for=condition=complete job/lumi-migrate --timeout=120s
```

### Step 3: Deploy Core Applications

```bash
# Deploy Scheduler
kubectl apply -f scheduler-deployment.yaml

# Deploy Gateway StatefulSet
kubectl apply -f gateway-statefulset.yaml

# Deploy Worker Pool
kubectl apply -f worker-deployment.yaml

# Deploy KEDA ScaledObject
kubectl apply -f worker-scaledobject.yaml
```

---

## 📈 Autoscaling & KEDA Verification

Worker scaling is governed by KEDA using Prometheus metric queries against Redis Stream lag (`lumi_stream_consumer_lag{group="lumi-workers"}`) and DLQ length.

### KEDA ScaledObject Configuration Summary

- **Min Replicas**: `2`
- **Max Replicas**: `20`
- **Polling Interval**: `15` seconds
- **Cooldown Period**: `300` seconds
- **Triggers**:
  - Prometheus Metric `lumi_stream_consumer_lag_workers` (Target Threshold: `500` pending events).
  - Prometheus Metric `lumi_stream_dlq_length_workers` (Target Threshold: `10` dead-letter events).

### Verification Commands

```bash
# Inspect ScaledObject status
kubectl -n lumi get scaledobject worker -o jsonpath='{.status}' | jq

# Describe active HPA created by KEDA
kubectl -n lumi describe hpa keda-hpa-worker

# Monitor worker pod replica count live
kubectl -n lumi get pods -l app=worker -w
```

---

## 🔧 Troubleshooting & Maintenance

### Viewing Pod Logs

```bash
# Gateway logs
kubectl -n lumi logs -l app=gateway --tail=100 -f

# Worker logs
kubectl -n lumi logs -l app=worker --tail=100 -f

# Scheduler logs
kubectl -n lumi logs -l app=scheduler --tail=100 -f
```

### Force Database Migration Re-run

```bash
kubectl -n lumi delete job lumi-migrate
kubectl apply -f migrate-job.yaml
```

### Graceful Restart of Workers

```bash
kubectl -n lumi rollout restart deployment/worker
```
