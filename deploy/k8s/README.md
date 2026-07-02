# Kubernetes deploy

These manifests are the **horizontally-scaling** path for Lumi. Single-host
operators stay on `docker compose up` (see root `docker-compose.yml`); compose
runs every service at `replicas: 1` and **does not autoscale**.

The k8s manifests assume:

- A cluster with [KEDA](https://keda.sh) v2.13+ installed (`kubectl get crd scaledobjects.keda.sh`).
- The observability stack reachable in-cluster as `prometheus.observability:9090`
  (override via `KEDA_PROMETHEUS_URL` on the `ScaledObject` if your Prometheus
  lives elsewhere).
- Postgres + Redis + RabbitMQ provided externally (managed services, or the
  in-cluster `ha` profile) — these manifests do **not** ship the data plane.
- A `lumi` namespace; create with `kubectl apply -f namespace.yaml`.

## Topology

| Component   | Workload kind | Replicas             | Why                                                                        |
| ----------- | ------------- | -------------------- | -------------------------------------------------------------------------- |
| `worker`    | `Deployment`  | autoscaled by KEDA   | Stateless. Pulls raw gateway events from Redis Streams, runs modules.      |
| `gateway`   | `StatefulSet` | 1+ (manual)          | Owns Discord WS; stable identity is needed for the cluster coordinator.    |
| `scheduler` | `Deployment`  | 1 (with leader lock) | Owns BullMQ. `SCHEDULER_LEADER_LOCK=true` makes scale-out safe but pointless. |

There is no dedicated `api` workload: dashboard RPC (RabbitMQ request/response)
is served by every worker via competing consumers.

## Apply order

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml -f secret.example.yaml   # edit secret first!
kubectl apply -f lumi-data-pvc.yaml    # shared RWX volume for downloaded addons
kubectl apply -f migrate-job.yaml      # run + wait for Prisma migrations
kubectl apply -f scheduler-deployment.yaml
kubectl apply -f gateway-statefulset.yaml   # includes the headless Service
kubectl apply -f worker-deployment.yaml
kubectl apply -f worker-scaledobject.yaml
```

## How the autoscaler decides

`worker-scaledobject.yaml` uses KEDA's **Prometheus trigger** against the
metric our worker emits today (`lumi_stream_consumer_lag`, exported on
`:9090/metrics` by `@lumi/observability`). The query sums pending entries
across every gateway stream for the `lumi-workers` consumer group:

```promql
sum(lumi_stream_consumer_lag{group="lumi-workers"})
```

- `threshold: 500` — KEDA targets one replica per 500 pending entries.
  Crossing 500 with N replicas → scale to N+1; sustained drop → scale down.
- `minReplicaCount: 2` — survive a single pod restart without lag spike.
- `maxReplicaCount: 20` — guardrail; revisit when Postgres pool tuning lets us
  go higher.
- `pollingInterval: 15s` — matches Prometheus' scrape interval, so we don't
  poll faster than the data updates.
- `cooldownPeriod: 300s` — wait 5 min after the metric falls below threshold
  before scaling down. Discord traffic is spiky; flapping replicas waste
  IDENTIFY budget on no one (workers don't IDENTIFY, but their warm caches
  go cold and the next batch of events all miss).

## Verifying

```bash
kubectl -n lumi get scaledobject worker -o jsonpath='{.status}' | jq
kubectl -n lumi describe hpa keda-hpa-worker
```

For the local equivalent (compose), see `scripts/chaos-autoscale.ts` — it
publishes a synthetic burst to a stream and asserts the lag metric crosses
the same 500 threshold the KEDA trigger watches.
