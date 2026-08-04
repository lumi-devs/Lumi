---
"@lumi/core": patch
---

Re-run addon validation (the forbidden internal-alias check) against every already-installed module in a repo after a `git pull` updates it, instead of only validating on first install — an addon that passed validation once could otherwise pull in code crossing the internal `#core`/`#lib` boundary without ever being re-checked.
