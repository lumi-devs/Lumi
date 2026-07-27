# Lumi Kubernetes & KEDA Deployment (`deploy/k8s/`)

<div align="center">
  <img src="https://img.shields.io/badge/Orchestrator-Kubernetes-blue?style=for-the-badge" alt="Kubernetes">
  <img src="https://img.shields.io/badge/Autoscaler-KEDA%20v2.13+-purple?style=for-the-badge" alt="KEDA">
  <img src="https://img.shields.io/badge/Metrics-Prometheus-red?style=for-the-badge" alt="Prometheus">
</div>

> Production Kubernetes manifests and KEDA autoscaling definitions for deploying Lumi in a horizontally scalable microservices architecture.

---

## 📦 Prerequisites

- **Kubernetes Cluster**: v1.26+
- **KEDA v2.13+**: Required for autoscaling worker pods based on event stream lag (`kubectl get crd scaledobjects.keda.sh`).
- **Prometheus**: Required for scraping the metric `lumi_stream_consumer_lag_workers`.
- **External Data Plane**: Managed PostgreSQL, Redis, and RabbitMQ clusters.

---

## 🏛️ Deployment Topology

- **`gateway` (`StatefulSet`)**: Manages Discord WebSocket shard connections. Manual replica scaling.
- **`worker` (`Deployment`)**: Stateless module & command execution engine. Autoscaled dynamically by KEDA (1 to 20 replicas).
- **`scheduler` (`Deployment`)**: Single-replica deployment managing BullMQ scheduled tasks.

---

## 📜 Manifest File Index

| Manifest File | Resource Type | Purpose |
|---|---|---|
| `namespace.yaml` | `Namespace` | Creates isolated `lumi` namespace |
| `configmap.yaml` | `ConfigMap` | Non-sensitive system configuration variables |
| `secret.example.yaml` | `Secret` | Template for `BOT_TOKEN` and database connection URIs |
| `lumi-data-pvc.yaml` | `PersistentVolumeClaim` | Data volume for temporary storage |
| `migrate-job.yaml` | `Job` | One-shot job running `bun run db:migrate` on deployment |
| `scheduler-deployment.yaml` | `Deployment` | Scheduler single pod workload |
| `gateway-statefulset.yaml` | `StatefulSet` | Gateway StatefulSet managing WS shards |
| `worker-deployment.yaml` | `Deployment` | Worker deployment template |
| `worker-scaledobject.yaml` | `ScaledObject` | KEDA autoscaler definition |

---

## 🚀 Execution & Verification

```bash
# 1. Apply Namespace and Configuration Secrets
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml -f secret.example.yaml

# 2. Run Migration Job
kubectl apply -f migrate-job.yaml

# 3. Deploy Workloads and Autoscaler
kubectl apply -f scheduler-deployment.yaml
kubectl apply -f gateway-statefulset.yaml
kubectl apply -f worker-deployment.yaml
kubectl apply -f worker-scaledobject.yaml

# 4. Verify KEDA ScaledObject Status
kubectl -n lumi get scaledobject worker
kubectl -n lumi describe hpa keda-hpa-worker
```
