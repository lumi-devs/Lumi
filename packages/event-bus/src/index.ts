// @ember/event-bus — cross-service bus for the gateway/worker split.
// Transports behind one interface: in-process EventEmitter (monolith / tests),
// Redis Streams, and NATS JetStream. Selected by the TRANSPORT env via
// createEventBus().

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
  NatsJetStreamBus,
  type NatsJetStreamBusOptions,
} from "./NatsJetStreamBus.js";
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
