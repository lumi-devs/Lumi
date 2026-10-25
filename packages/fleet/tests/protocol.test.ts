import { describe, it, expect } from "vitest";
import {
  FleetEventType,
  encodeMessage,
  decodeMessage,
  eventTypeToString,
  type IdentifyData,
  type StartShardsData,
  type StopShardData,
  type HeartbeatData,
  type CrossShardRequestData,
} from "../src/protocol.js";

describe("Fleet Protocol", () => {
  describe("encodeMessage / decodeMessage", () => {
    it("should encode and decode Identify message", () => {
      const data: IdentifyData = {
        totalShards: 10,
        runningShards: [0, 1, 2],
        version: "2.0.0",
        nodeId: "worker-1",
        orchestratorLogicVersion: 1,
      };
      
      const encoded = encodeMessage(FleetEventType.EvtIdentify, data);
      const decoded = decodeMessage(encoded);
      
      expect(decoded).not.toBeNull();
      expect(decoded!.eventType).toBe(FleetEventType.EvtIdentify);
      expect(decoded!.data).toEqual(data);
    });
    
    it("should encode and decode StartShards message", () => {
      const data: StartShardsData = { shardIds: [3, 4, 5] };
      const encoded = encodeMessage(FleetEventType.EvtStartShards, data);
      const decoded = decodeMessage(encoded);
      
      expect(decoded!.eventType).toBe(FleetEventType.EvtStartShards);
      expect(decoded!.data.shardIds).toEqual([3, 4, 5]);
    });
    
    it("should encode and decode StopShard message", () => {
      const data: StopShardData = { shardId: 2 };
      const encoded = encodeMessage(FleetEventType.EvtStopShard, data);
      const decoded = decodeMessage(encoded);
      
      expect(decoded!.eventType).toBe(FleetEventType.EvtStopShard);
      expect(decoded!.data.shardId).toBe(2);
    });
    
    it("should encode and decode Heartbeat message", () => {
      const data: HeartbeatData = {
        shards: [
          { id: 0, guildCount: 100, latency: 50, status: "ready" },
          { id: 1, guildCount: 95, latency: 55, status: "ready" },
        ],
        timestamp: Date.now(),
      };
      
      const encoded = encodeMessage(FleetEventType.EvtHeartbeat, data);
      const decoded = decodeMessage(encoded);
      
      expect(decoded!.eventType).toBe(FleetEventType.EvtHeartbeat);
      expect(decoded!.data.shards).toHaveLength(2);
    });
    
    it("should encode and decode CrossShardRequest message", () => {
      const data: CrossShardRequestData = {
        requestId: "req-123",
        type: "global_leaderboard",
        fromShard: 0,
        targetShards: "all",
        payload: { type: "economy", limit: 100 },
        timeout: 10000,
      };
      
      const encoded = encodeMessage(FleetEventType.EvtCrossShardRequest, data);
      const decoded = decodeMessage(encoded);
      
      expect(decoded!.eventType).toBe(FleetEventType.EvtCrossShardRequest);
      expect(decoded!.data.requestId).toBe("req-123");
      expect(decoded!.data.type).toBe("global_leaderboard");
    });
    
    it("should handle null data (Shutdown)", () => {
      const encoded = encodeMessage(FleetEventType.EvtShutdown, null);
      const decoded = decodeMessage(encoded);
      
      expect(decoded!.eventType).toBe(FleetEventType.EvtShutdown);
      expect(decoded!.data).toBeNull();
    });
  });
  
  describe("eventTypeToString", () => {
    it("should return correct names for all event types", () => {
      expect(eventTypeToString(FleetEventType.EvtIdentify)).toBe("Identify");
      expect(eventTypeToString(FleetEventType.EvtIdentified)).toBe("Identified");
      expect(eventTypeToString(FleetEventType.EvtHeartbeat)).toBe("Heartbeat");
      expect(eventTypeToString(FleetEventType.EvtHeartbeatAck)).toBe("HeartbeatAck");
      expect(eventTypeToString(FleetEventType.EvtShutdown)).toBe("Shutdown");
      expect(eventTypeToString(FleetEventType.EvtStartShards)).toBe("StartShards");
      expect(eventTypeToString(FleetEventType.EvtStopShard)).toBe("StopShard");
      expect(eventTypeToString(FleetEventType.EvtShardStatus)).toBe("ShardStatus");
      expect(eventTypeToString(FleetEventType.EvtPrepareShardMigration)).toBe("PrepareShardMigration");
      expect(eventTypeToString(FleetEventType.EvtStartShardMigration)).toBe("StartShardMigration");
      expect(eventTypeToString(FleetEventType.EvtAllStateDataSent)).toBe("AllStateDataSent");
      expect(eventTypeToString(FleetEventType.EvtDeploy)).toBe("Deploy");
      expect(eventTypeToString(FleetEventType.EvtDeployComplete)).toBe("DeployComplete");
      expect(eventTypeToString(FleetEventType.EvtCrossShardRequest)).toBe("CrossShardRequest");
      expect(eventTypeToString(FleetEventType.EvtCrossShardResponse)).toBe("CrossShardResponse");
      expect(eventTypeToString(FleetEventType.EvtMetrics)).toBe("Metrics");
    });
    
    it("should return Unknown for invalid types", () => {
      expect(eventTypeToString(999 as any)).toBe("Unknown(999)");
    });
  });
  
  describe("Wire format", () => {
    it("should have correct header size", () => {
      const data = { test: "value" };
      const encoded = encodeMessage(FleetEventType.EvtIdentify, data);
      
      // Header: 4 bytes event type + 4 bytes length
      expect(encoded.length).toBe(8 + Buffer.byteLength(JSON.stringify(data)));
      
      // Check event type (little-endian uint32)
      expect(encoded.readUInt32LE(0)).toBe(FleetEventType.EvtIdentify);
      
      // Check length
      expect(encoded.readUInt32LE(4)).toBe(Buffer.byteLength(JSON.stringify(data)));
    });
    
    it("should decode partial buffer as null", () => {
      const partial = Buffer.alloc(4); // Only event type, no length
      partial.writeUInt32LE(FleetEventType.EvtIdentify, 0);
      
      const decoded = decodeMessage(partial);
      expect(decoded).toBeNull();
    });
  });
});