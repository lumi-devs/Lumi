---
"@lumi/core": patch
---

Serialize the verification captcha's read-modify-write challenge-state update per member so two concurrent submissions (a double-click, or a retried interaction) can no longer both read stale state and clobber each other's write — closing a race that could weaken the attempt limit or double-process a verification outcome.
