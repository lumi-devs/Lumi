// This module must be imported first in main.ts, before any instrumented
// library is pulled in transitively (ESM hoists imports) - see
// packages/observability/src/boot.ts's top-of-file comment and
// apps/worker/src/telemetry.ts's equivalent.
import { bootstrapTelemetry } from "@lumi/observability";

// Unlike the worker's ShardingManager children, every apps/api replica is
// its own standalone pod (deploy/k8s/api-deployment.yaml, 2 replicas) - none
// of them share a metrics port with a sibling, so this always binds it.
bootstrapTelemetry("api");
