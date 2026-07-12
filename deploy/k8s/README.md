# Lumi Kubernetes Deployment

This directory contains Kubernetes manifests for deploying Lumi in a horizontally scaled architecture.

## Prerequisites

- **KEDA v2.13+**: Required for autoscaling the worker deployment (`kubectl get crd scaledobjects.keda.sh`).
- **Prometheus**: Required for KEDA to scrape the `lumi_stream_consumer_lag_workers` metric.
- **External Data Plane**: PostgreSQL, Redis, and RabbitMQ must be deployed separately.

## Deployment Topology

- **`gateway` (StatefulSet)**: Owns Discord WS connections. Manual scaling only.
- **`worker` (Deployment)**: Stateless module execution. Autoscaled by KEDA based on stream lag.
- **`scheduler` (Deployment)**: Single replica managing scheduled tasks.

## Apply Order

Ensure you have configured `secret.example.yaml` before applying.

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml -f secret.example.yaml
kubectl apply -f lumi-data-pvc.yaml
kubectl apply -f migrate-job.yaml
kubectl apply -f scheduler-deployment.yaml
kubectl apply -f gateway-statefulset.yaml
kubectl apply -f worker-deployment.yaml
kubectl apply -f worker-scaledobject.yaml
```

## Verifying Deployment

To check the KEDA autoscaler status:
```bash
kubectl -n lumi get scaledobject worker -o jsonpath='{.status}' | jq
kubectl -n lumi describe hpa keda-hpa-worker
```
