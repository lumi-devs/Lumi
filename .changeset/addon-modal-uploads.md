---
"@lumi-devs/contracts": patch
"@lumi/core": patch
---

Addon modal file uploads end to end: `modal()` builds label-wrapped file-upload components, the host serialises uploads onto the invocation, and `discord.attachments.rehost` (Discord CDN URLs only, 8MB cap, gated under `sendMessage`) re-hosts them. `discord.channels.send` accepts `replyTo` for native message references without pinging. The host acknowledges modal submits before invoking the addon so slow handlers no longer blow the 3s window.
