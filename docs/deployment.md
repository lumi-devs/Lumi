# Lumi Production Deployment Guide

> Production deployment guide covering single-node Docker Compose, multi-process distributed microservices topologies, Kubernetes/KEDA autoscaling, and database migration strategies.

---

## 🚀 1. Single-Node Docker Compose Deployment

For small to medium-sized Discord bots or single-server hosting, Docker Compose provides a self-contained environment bundling Lumi Monolith, PostgreSQL, Redis, and RabbitMQ.

### Setup Instructions

1. **Clone Repository & Prepare Environment**:
   ```bash
   git clone https://github.com/lumi-devs/lumi.git && cd lumi
   cp .env.example .env
   ```

2. **Configure `.env`**:
   Ensure `BOT_TOKEN`, `CLIENT_ID`, and database passwords are set.

3. **Start the Stack**:
   ```bash
   docker compose up -d
   ```

4. **Verify Container Health**:
   ```bash
   docker compose ps
   docker compose logs -f lumi
   ```

---

## ⚡ 2. Multi-Process Distributed Deployment

For enterprise-grade deployments handling thousands of guilds and millions of Discord events, split Lumi into dedicated role microservices using the `distributed` Docker Compose profile or custom container orchestrators.

### Topology Roles

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  apps/gateway   │       │   apps/worker   │       │  apps/scheduler │       │  apps/dashboard │
│(LUMI_ROLE=gat..)│       │(LUMI_ROLE=wor..)│       │(LUMI_ROLE=sch..)│       │ (Web Admin UI)  │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │                         │
         ▼                         ▼                         ▼                         ▼
  Redis / NATS               Stateless Engine           BullMQ Queue              RabbitMQ RPC
```

### Launching Distributed Profile

```bash
docker compose --profile distributed up -d
```

### Environment Variable Role Assignments

- **`gateway` node (`LUMI_ROLE=gateway`)**:
  - Requires `TRANSPORT=streams` or `TRANSPORT=nats`.
  - Requires `BOT_TOKEN`, `REDIS_HOST`, `REDIS_PORT`.
  - Optional: `CLUSTER_NAME` for multi-gateway cluster coordination.

- **`worker` nodes (`LUMI_ROLE=worker`)**:
  - Stateless execution nodes (can run 1 to N replicas).
  - Requires `DATABASE_URL`, `REDIS_HOST`, `RABBITMQ_URL`, `TRANSPORT`.

- **`scheduler` node (`LUMI_ROLE=scheduler`)**:
  - Single active replica owning the BullMQ task queue.
  - Requires `REDIS_HOST`, `RABBITMQ_URL`, `DATABASE_URL`.

- **`dashboard` node (`apps/dashboard`)**:
  - Internet-facing web application.
  - Requires `RABBITMQ_URL`, `DISCORD_OAUTH2_CLIENT_ID`, `DISCORD_OAUTH2_CLIENT_SECRET`, `DASHBOARD_SESSION_SECRET`.

---

## ☸️ 3. Kubernetes & KEDA Autoscaling (`deploy/k8s/`)

Lumi includes production-ready Kubernetes manifests in `deploy/k8s/` designed to autoscale worker nodes based on event stream lag using KEDA (Kubernetes Event-driven Autoscaling).

### Manifest Inventory

- `namespace.yaml` — Dedicated `lumi` namespace.
- `configmap.yaml` & `secret.example.yaml` — System configuration & secrets.
- `lumi-data-pvc.yaml` — Persistent volume claims.
- `migrate-job.yaml` — Database migration job.
- `gateway-statefulset.yaml` — StatefulSet for Gateway replicas.
- `worker-deployment.yaml` — Deployment for stateless worker nodes.
- `scheduler-deployment.yaml` — Single-replica Scheduler deployment.
- `worker-scaledobject.yaml` — KEDA `ScaledObject` definition.

### KEDA Scaling Architecture

`worker-scaledobject.yaml` configures KEDA to scrape the Prometheus metric `lumi_stream_consumer_lag_workers` exposed by `@lumi/observability` on `METRICS_PORT=9090`. When event lag spikes, KEDA dynamically scales worker pods from 1 up to 20 instances.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
  namespace: lumi
spec:
  scaleTargetRef:
    name: worker
  minReplicaCount: 2
  maxReplicaCount: 20
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-k8s.monitoring.svc:9090
        metricName: lumi_stream_consumer_lag_workers
        threshold: '100'
        query: sum(lumi_stream_consumer_lag_workers)
```

### Deployment Commands

```bash
# 1. Apply Namespace and Configurations
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml -f deploy/k8s/secret.example.yaml

# 2. Run Database Migration Job
kubectl apply -f deploy/k8s/migrate-job.yaml

# 3. Deploy Workloads & Scaler
kubectl apply -f deploy/k8s/scheduler-deployment.yaml
kubectl apply -f deploy/k8s/gateway-statefulset.yaml
kubectl apply -f deploy/k8s/worker-deployment.yaml
kubectl apply -f deploy/k8s/worker-scaledobject.yaml
```

---

## 💾 4. Database Schema Management: Push vs Migrations

Lumi utilizes Prisma ORM with PostgreSQL. It is critical to use the appropriate schema update command depending on the environment:

### Development Environment (`db:push`)

In local development, use Prisma's direct schema sync tool:

```bash
bun run db:push
```

- **Behavior**: Directly syncs `schema.prisma` with the target database without creating migration SQL files.
- **Safety**: ⚠️ May drop tables or columns if schema changes conflict. **NEVER use in production.**

### Production Environment (`db:migrate`)

In production environments, execute version-controlled Prisma migrations:

```bash
bun run db:migrate
```

- **Behavior**: Applies checked-in SQL migration files sequentially, maintaining audit history and data integrity.
- **Safety**: Safe for live databases. Ensures zero accidental table drops.
