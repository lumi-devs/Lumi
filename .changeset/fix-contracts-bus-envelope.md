---
"@lumi/contracts": patch
---

Replace `BusEventEnvelope<T>` (which wrongly implied a nested `{ payload: T }` wire shape) with a generic `BusEventMessage<T>` that reflects the actual flat envelope `RabbitClient#publishEvent` puts on the wire, so consumers get correctly typed fields instead of reaching for a `.payload` that doesn't exist.
