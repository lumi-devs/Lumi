---
"@lumi/event-bus": patch
---

Fix synthetic shard object in RawGatewayConsumer to implement `checkReady`, `status`, `send`, `close`, and `destroy` required by Discord.js packet handling when running in distributed worker mode.
