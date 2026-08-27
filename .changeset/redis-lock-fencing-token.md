---
"@lumi/core": minor
---

**Addon SDK**: `acquireRedisLock` now returns `{ release, token }` instead of the release
function directly - `token` is a fencing token addons can pass to the new `verifyRedisLock`
to detect a stale lock holder before a guarded write. Update any addon calling
`acquireRedisLock` from `const release = await acquireRedisLock(...)` to
`const { release } = await acquireRedisLock(...)`.
