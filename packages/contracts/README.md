# `@lumi/contracts`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Contracts%20%26%20Types-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=for-the-badge" alt="Dependencies">
</div>

> Shared wire contracts, type definitions, RPC schemas, and manifest interfaces for all Lumi microservices and the web dashboard.

---

## 📦 Role & Overview

`@lumi/contracts` serves as the single source of truth for all network contracts across process boundaries. It has **zero runtime dependencies** (`discord.js` is imported as type-only), ensuring ultra-fast compilation across all monorepo packages.

---

## 🔑 Key Exported Wire Contracts

### 1. RPC Contracts (`rpc.ts`)
- `RPC_ACTIONS`: Constant map of supported RPC actions:
  - `global.gdpr.delete`
  - `downloader.repo.add`, `downloader.repo.list`, `downloader.repo.modules`
  - `downloader.module.install`, `downloader.module.uninstall`
  - `guild.dashboard.get`, `guild.module.toggle`, `guild.config.set`
- `RpcRequest`, `RpcResponse<T>`, `RpcError`: Standardized RPC message envelopes.

### 2. Bus Contracts (`bus.ts`)
- `rawGatewayStream`: Stream topic name (`lumi.gateway.raw`).
- `SCHEDULER_FIRE_STREAM_PREFIX`: Stream prefix for task fire events (`lumi.scheduler.fire:`).
- `TaskFirePayload`, `ScheduleRequestPayload`.

### 3. Gateway Envelopes (`gateway-packet.ts`)
- `RawGatewayEnvelope`: Packet wrapper containing `shardId`, `packet` (`GatewayDispatchPayload`), `ts`, `guildId`, and OpenTelemetry trace headers.

### 4. Module Manifests (`manifest.ts`, `config.ts`)
- `ModuleManifest`: Schema interface for third-party addon manifests.
- `ConfigField`: Flat configuration field metadata interface for dashboard form rendering.

---

## 💻 Usage Example

```typescript
import { RPC_ACTIONS, type RpcRequest, type RawGatewayEnvelope } from "@lumi/contracts";

const request: RpcRequest = {
  action: RPC_ACTIONS.GUILD_CONFIG_SET,
  guildId: "123456789012345678",
  payload: { module: "filter", key: "blockInvites", value: true },
};
```
