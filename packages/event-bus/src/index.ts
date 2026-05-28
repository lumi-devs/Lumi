// @ember/event-bus — cross-service bus for the gateway/worker split.
// Two transports behind one interface: Redis Streams (production, durable,
// consumer-group horizontal scale) and in-process EventEmitter (monolith / tests).
// Selected by the TRANSPORT env via createEventBus(). See packages/event-bus/README
// or TODO.md PART II for the rollout slices.

export type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
  TransportKind,
} from "./types.js";
export { InProcBus } from "./InProcBus.js";
export {
  RedisStreamsBus,
  type RedisStreamsBusOptions,
  type StreamStats,
} from "./RedisStreamsBus.js";
export {
  createEventBus,
  type CreateEventBusOptions,
  type OwnedEventBus,
} from "./factory.js";
export {
  RawGatewayPublisher,
  type RawGatewayPublisherOptions,
} from "./RawGatewayPublisher.js";
export {
  RawGatewayConsumer,
  type RawGatewayConsumerOptions,
  DEFAULT_RAW_DISPATCH_TYPES,
} from "./RawGatewayConsumer.js";
