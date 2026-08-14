---
"@lumi/core": patch
---

Removes the peer-to-peer Redis leader-election coordinator for command registration in favor of relying on the existing static shard-owner assignment, and simplifies the command-registration cache fence to match.
