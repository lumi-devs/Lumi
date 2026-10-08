---
"@lumi/core": patch
---

Rebuild test coverage on the def-based APIs: command handlers run through real `CommandContext`s, listeners through `execute(services, ...)`, interactions through `run(services, ...)`, ModuleStore against its real discovery lifecycle. No production code changes.
