---
"@lumi/event-bus": patch
---

Fix Head-Of-Line socket blocking in RedisStreamsBus by executing non-blocking xautoclaim on publisher connection instead of blocking subscriber connection.
