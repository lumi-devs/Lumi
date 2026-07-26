// @lumi/event-bus — cross-service bus for the gateway/worker split.
// Powered 100% by Redis Streams via createEventBus().

export type {
  BusMessage,
  ConsumeOptions,
  EventBus,
  PublishOptions,
  TransportKind,
} from "./types.js";
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
  attachProxyPublisher,
  type AttachProxyPublisherOptions,
} from "./RawGatewayPublisher.js";
export {
  RawGatewayConsumer,
  type RawGatewayConsumerOptions,
  DEFAULT_RAW_DISPATCH_TYPES,
} from "./RawGatewayConsumer.js";
