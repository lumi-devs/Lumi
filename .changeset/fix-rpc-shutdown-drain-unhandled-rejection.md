---
"@lumi/core": patch
---

RabbitMQ RPC shutdown now drains in-flight requests (bounded by a timeout) before closing the channel/connection instead of dropping them, and the process now has an `unhandledRejection` handler so a rejected promise is logged instead of crashing the process outright.
