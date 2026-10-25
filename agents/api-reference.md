# API Reference (ConnectRPC)

Generated from `proto/lumi/v2/*.proto`. All services use ConnectRPC with protobuf over HTTP/2.

## Base URL

```
http://localhost:8080/lumi.v2.<ServiceName>/<MethodName>
```

Or via gRPC-web proxy for browser clients.

---

## PermitService

**Package:** `lumi.v2`  
**Service:** `PermitService`

### ListPermits
```protobuf
rpc ListPermits(ListPermitsRequest) returns (ListPermitsResponse)
```

Get all permits for a guild.

**Request:**
```json
{
  "guild_id": "string"
}
```

**Response:**
```json
{
  "permits": [
    {
      "id": 1,
      "name": "string",
      "node": "mod.ban",
      "polarity": "GRANT",
      "position": 0,
      "builtin": false,
      "expires_at": "2024-12-31T23:59:59Z",
      "schedule": "0 9 * * 1-5",
      "timezone": "America/New_York",
      "conditions": "{\"channelIds\":[\"...\"]}"
    }
  ]
}
```

### CreatePermit
```protobuf
rpc CreatePermit(CreatePermitRequest) returns (CreatePermitResponse)
```

Create a new permit.

**Request:**
```json
{
  "guild_id": "string",
  "name": "string",
  "node": "mod.ban",
  "polarity": "GRANT",
  "position": 0,
  "expires_at": "2024-12-31T23:59:59Z",
  "schedule": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "conditions": "{\"channelIds\":[\"...\"]}"
}
```

### UpdatePermit
```protobuf
rpc UpdatePermit(UpdatePermitRequest) returns (UpdatePermitResponse)
```

Update an existing permit.

### DeletePermit
```protobuf
rpc DeletePermit(DeletePermitRequest) returns (DeletePermitResponse)
```

Delete a permit by ID.

### MovePermit
```protobuf
rpc MovePermit(MovePermitRequest) returns (MovePermitResponse)
```

Move a permit up or down in priority.

**Request:**
```json
{
  "guild_id": "string",
  "permit_id": 1,
  "direction": "UP"  // or "DOWN"
}
```

### AssignPermit
```protobuf
rpc AssignPermit(AssignPermitRequest) returns (AssignPermitResponse)
```

Assign a permit to a user, role, or channel.

**Request:**
```json
{
  "permit_id": 1,
  "target_type": "USER",  // USER | ROLE | CHANNEL
  "target_id": "1234567890",
  "granted_by": "1234567890",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### UnassignPermit
```protobuf
rpc UnassignPermit(UnassignPermitRequest) returns (UnassignPermitResponse)
```

Remove a permit assignment.

### ExplainPermit
```protobuf
rpc ExplainPermit(ExplainPermitRequest) returns (ExplainPermitResponse)
```

Debug a permission check — shows the full evaluation chain.

**Request:**
```json
{
  "guild_id": "string",
  "user_id": "string",
  "role_ids": ["string"],
  "channel_id": "string",
  "guild_owner_id": "string",
  "node": "mod.ban"
}
```

**Response:**
```json
{
  "rows": [
    {
      "tier": "builtin: Extra Owner",
      "verdict": "ALLOW",
      "detail": "grant *"
    },
    {
      "tier": "custom: Mod Role",
      "verdict": "PASS",
      "detail": ""
    }
  ]
}
```

### GetExpiringPermits
```protobuf
rpc GetExpiringPermits(GetExpiringPermitsRequest) returns (GetExpiringPermitsResponse)
```

Get permits expiring before a given timestamp.

---

## ModuleService

**Package:** `lumi.v2`  
**Service:** `ModuleService`

### ListModules
```protobuf
rpc ListModules(ListModulesRequest) returns (ListModulesResponse)
```

List all available modules.

**Response:**
```json
{
  "modules": [
    {
      "name": "mod",
      "display_name": "Moderation",
      "emoji": "🛡️",
      "description": "Case-backed moderation...",
      "version": "2.0.0",
      "enabled_by_default": true
    }
  ]
}
```

### GetModuleConfig
```protobuf
rpc GetModuleConfig(GetModuleConfigRequest) returns (GetModuleConfigResponse)
```

Get a guild's config for a module (JSON string).

### SetModuleConfig
```protobuf
rpc SetModuleConfig(SetModuleConfigRequest) returns (SetModuleConfigResponse)
```

Set a guild's config for a module.

### EnableModule
```protobuf
rpc EnableModule(EnableModuleRequest) returns (EnableModuleResponse)
```

Enable a module for a guild.

### DisableModule
```protobuf
rpc DisableModule(DisableModuleRequest) returns (DisableModuleResponse)
```

Disable a module for a guild.

### ReloadModule
```protobuf
rpc ReloadModule(ReloadModuleRequest) returns (ReloadModuleResponse)
```

Hot-reload a module (pulls fresh code from disk).

---

## FleetService

**Package:** `lumi.v2`  
**Service:** `FleetService`

### GetFleetStatus
```protobuf
rpc GetFleetStatus(GetFleetStatusRequest) returns (FleetStatus)
```

Get overall fleet health and node list.

**Response:**
```json
{
  "nodes": [
    {
      "node_id": "worker-1",
      "shard_start": 0,
      "shard_end": 9,
      "healthy": true,
      "last_heartbeat": 1703548800000,
      "guilds": 1234,
      "users": 56789
    }
  ],
  "total_shards": 10,
  "online_shards": 10,
  "status": "healthy"
}
```

### GetShardAssignment
```protobuf
rpc GetShardAssignment(GetShardAssignmentRequest) returns (ShardAssignment)
```

Get which node handles a guild's shard.

### RebalanceShards
```protobuf
rpc RebalanceShards(RebalanceShardsRequest) returns (RebalanceShardsResponse)
```

Trigger a manual rebalance of shards across workers.

**Response:**
```json
{
  "success": true,
  "moves": [
    {
      "shard_id": 5,
      "from_node": "worker-1",
      "to_node": "worker-2"
    }
  ]
}
```

### GetNodeHealth
```protobuf
rpc GetNodeHealth(GetNodeHealthRequest) returns (NodeHealth)
```

Get detailed health metrics for a specific node.

### TriggerRollingRestart
```protobuf
rpc TriggerRollingRestart(TriggerRollingRestartRequest) returns (RollingRestartStatus)
```

Start a rolling restart of all workers.

**Request:**
```json
{
  "batch_size": 2,
  "delay_seconds": 30
}
```

---

## LevelingService

**Package:** `lumi.v2`  
**Service:** `LevelingService`

### GetLeaderboard
```protobuf
rpc GetLeaderboard(GetLeaderboardRequest) returns (LeaderboardResponse)
```

Get guild XP leaderboard.

**Request:**
```json
{
  "guild_id": "string",
  "page": 1,
  "per_page": 10
}
```

### GetUserRank
```protobuf
rpc GetUserRank(GetUserRankRequest) returns (UserRankResponse)
```

Get a specific user's rank and XP.

### GenerateRankCard
```protobuf
rpc GenerateRankCard(GenerateRankCardRequest) returns (RankCardResponse)
```

Generate a rank card image (returns PNG bytes).

### SetXpCurve
```protobuf
rpc SetXpCurve(SetXpCurveRequest) returns (SetXpCurveResponse)
```

Set custom XP curve for a guild.

---

## EconomyService

**Package:** `lumi.v2`  
**Service:** `EconomyService`

### GetBalance
```protobuf
rpc GetBalance(GetBalanceRequest) returns (BalanceResponse)
```

Get user's wallet, bank, and totals.

### Transfer
```protobuf
rpc Transfer(TransferRequest) returns (TransferResponse)
```

Transfer currency between users.

### GetShop
```protobuf
rpc GetShop(GetShopRequest) returns (ShopResponse)
```

Get guild's shop items.

### BuyItem
```protobuf
rpc BuyItem(BuyItemRequest) returns (BuyItemResponse)
```

Purchase an item from the shop.

### GenerateBalanceCard
```protobuf
rpc GenerateBalanceCard(GenerateBalanceCardRequest) returns (BalanceCardResponse)
```

Generate a balance card image (returns PNG bytes).

### GetLeaderboard
```protobuf
rpc GetLeaderboard(GetEconomyLeaderboardRequest) returns (EconomyLeaderboardResponse)
```

Get economy leaderboard for a guild.

---

## Enums Reference

### Polarity
| Value | Name | Description |
|-------|------|-------------|
| 1 | GRANT | Allow access |
| 2 | DENY | Block access |

### Verdict
| Value | Name | Description |
|-------|------|-------------|
| 1 | ALLOW | Explicitly allowed |
| 2 | REJECT | Explicitly denied |
| 3 | PASS | No matching permit, continue to next tier |

### TargetType
| Value | Name | Description |
|-------|------|-------------|
| 1 | USER | Discord user ID |
| 2 | ROLE | Discord role ID |
| 3 | CHANNEL | Discord channel ID |

### Direction
| Value | Name | Description |
|-------|------|-------------|
| 1 | UP | Move permit higher (earlier in chain) |
| 2 | DOWN | Move permit lower (later in chain) |

---

## Error Codes

All methods may return ConnectRPC errors:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ok` | 200 | Success |
| `cancelled` | 499 | Request cancelled |
| `unknown` | 500 | Unknown error |
| `invalid_argument` | 400 | Invalid request |
| `deadline_exceeded` | 504 | Timeout |
| `not_found` | 404 | Resource not found |
| `already_exists` | 409 | Conflict |
| `permission_denied` | 403 | Unauthorized |
| `unauthenticated` | 401 | Not authenticated |
| `resource_exhausted` | 429 | Rate limited |
| `failed_precondition` | 400 | Precondition failed |
| `aborted` | 409 | Aborted |
| `out_of_range` | 400 | Out of range |
| `unimplemented` | 501 | Not implemented |
| `internal` | 500 | Internal error |
| `unavailable` | 503 | Service unavailable |
| `data_loss` | 500 | Data loss |

---

## Authentication

All endpoints require a valid bot token in the `Authorization` header:
```
Authorization: Bot <DISCORD_BOT_TOKEN>
```

Dashboard clients use Discord OAuth2 — see [Dashboard Auth](#dashboard-auth) for details.