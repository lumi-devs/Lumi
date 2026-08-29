---
"@lumi/core": minor
"@lumi/dashboard": minor
"@lumi/worker": minor
---

**Enterprise & Mega-Fleet Scaling (100k-1M+ Guilds, 50-500+ Shards)**:
- Added Discord REST proxy support (`nirn-proxy`) with path normalization, infinite local request rate limit delegation, configurable request timeouts, and retry controls.
- Added Redis Cluster multi-master support with replica read scaling (`REDIS_CLUSTER_SCALE_READS`), dynamic slot refresh timeouts, and retry strategies.
- Added PostgreSQL read-replica connection pool aliases (`DATABASE_READ_URL`, `POSTGRES_REPLICA_URL`) and `application_name` tagging.
- Added environment-tunable cache limits and sweeper interval controls for high shard density.
- Added production multi-stage Next.js Dockerfile (`Dockerfile.dashboard`) and multi-target GitHub Actions container publishing to GHCR.
- Added Kubernetes deployment manifests for the dashboard and updated production statefulset configurations.
