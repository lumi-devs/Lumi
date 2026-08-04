---
"@lumi/core": minor
---

Export `sendReply`, `replySuccess`, `replyError`, `replyWarning`, `replyInfo`, `assertPermit`, and the `CommandReplyTarget` type from the public addon SDK (`lumi/commands`), giving third-party addons standalone reply/permission-assertion helpers that don't require reaching into internal (`#core`/`#lib`) modules.
