---
"@lumi/core": minor
"@lumi/dashboard": minor
"@lumi/contracts": minor
"@lumi/event-bus": minor
"@lumi/observability": patch
---

**Dashboard**: full Control Room redesign (dark mission-control theme, sidebar nav, KPI/module/audit cards, right rail), a real "remove override" action for the module kill-switch (previously add-only), and accessible in-app Privacy Policy/Terms of Service pages.

**Security**: authenticated internal RPC bridge (bearer token, loopback-only default), a cross-guild permit IDOR fix, a DM permission fail-open fix, purge ReDoS sandboxing via the regex worker, metrics/health endpoint exposure lockdown, NextAuth rate limiting, spoof-resistant client-IP resolution behind proxies, and CI slash-command supply-chain hardening (author-authorization gate, privilege-separated jobs, pinned action SHAs).

**Core**: the scheduler role no longer opens a Discord gateway connection (was burning IDENTIFY budget and duplicating listeners), guild-count now aggregates the real cross-replica cluster snapshot instead of one process's local cache, and event-bus consumer groups are cleaned up on shutdown instead of leaking in Redis.

**GDPR**: a user's own data export now redacts the identity of a moderator who acted against them (only their own actions as moderator remain visible), matching Recital 63.

**Cards**: the `primary` card accent color is blank by default (matching `/ping`) instead of a hardcoded brand blurple; status colors (success/error/warning/info) are unchanged. Still overridable via `config/bot.ts`.
