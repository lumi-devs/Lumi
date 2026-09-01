# Architecture Audit Report — Lumi Monorepo

Scope: full monorepo, read-only investigation against the 10 Ground Rules in `AUDIT-RULEBOOK.md`.

---

## CRITICAL

### CRITICAL-1 — Cross-module import: `dashboard` module imports from `security` module (Ground Rule 1)
`packages/core/src/modules/dashboard/rpc/security-rpc.ts:5` imports the `GuildBackupData` type directly from `#modules/security/lib/backup.js`. This is a direct violation of the Zero Cross-Module Import Law — `dashboard` and `security` are sibling modules under `packages/core/src/modules/`.

Related runtime dependency (see HIGH-6): the same file calls `tryGetUtility("security")` and invokes `security.restoreFromBackup()` at runtime, meaning the dashboard module's RPC layer has a hard runtime dependency on the security module being loaded, not just a type-level import.

**Fix**: Extract `GuildBackupData` and the backup restore/snapshot logic into a shared `#lib/backup/` module that both `dashboard` and `security` modules can import from. Alternatively, move the security-related RPC handlers (backup restore) into the security module itself so it registers its own RPC handlers rather than dashboard reaching into it.

### CRITICAL-2 — Widespread direct `redis.del()` bypassing `container.invalidation` (Ground Rule 3)
A repo-wide sweep for `redis.del(` / `.del(` calls on cache-shaped keys found a recurring pattern:

```ts
if (container.invalidation) {
  await container.invalidation.invalidate(key);
} else {
  await container.redis.del(key);
}
```

Call sites: `SecurityUtility.ts:557,656,823`, `QuarantineAction.ts:120`, `lib/utilities/thresholds.ts:17`, `VoiceMuteAction.ts:68,107`, `mod/lib/thresholds.ts:161`, `filter/utilities/FilterUtility.ts:278,434`, `filter/lib/auto-lockdown-handler.ts:21`, `tempvc/lib/voice-occupancy.ts:63`, `afk/data/afk.ts:194`, `lib/database/cluster-safe.ts:127,131`.

`container.invalidation` is initialized unconditionally during `LumiClient.login()` before any command/listener code can run, so the `else` branch is dead code in practice — but its presence in the source implies invalidation is optional, which contradicts Ground Rule 3's "must occur exclusively via `container.invalidation`" wording, and a future refactor that makes `container.invalidation` genuinely optional (e.g. a lightweight worker mode) would silently reintroduce a real cache-bypass bug.

**Fix**: Remove the `if (container.invalidation) {...} else {...}` conditional everywhere it appears; call `container.invalidation.invalidate(...)` unconditionally. If any of the flagged keys are intentionally single-shard ephemeral state rather than cross-shard cache, document that exception explicitly in the rulebook rather than leaving a silent fallback branch.

---

## HIGH

### HIGH-1 — Repository classes use `this.prisma` directly (informational / rulebook ambiguity)
Repository classes under `packages/core/src/lib/prisma/repositories/*.ts` call `this.prisma.<model>.findMany(...)` etc. directly rather than going through `container.db`. Ground Rule 2 says "All runtime database operations must use `container.db`" — read literally this looks like a violation, but `container.db` *is* `DatabaseService`, which is composed of these repository instances; the repositories are the implementation of `container.db`, not a bypass of it. This is almost certainly intended design, not a defect. Recommend clarifying Ground Rule 2's wording to say "application/feature code" rather than "all runtime database operations" to avoid this false positive in future audits.

### HIGH-2 — Dashboard direct Redis for rate limiting (Ground Rule 8)
Same finding as the Security audit's HIGH: `apps/dashboard/src/lib/rate-limit.ts` instantiates `ioredis` directly against `REDIS_URL`. See `AUDIT-SECURITY.md` for full detail; not duplicated here.

### HIGH-3 — Raw Discord component builders instead of `#utilities/panels.js` kit (Ground Rule 5)
Files using `new ActionRowBuilder()`, `new ButtonBuilder()`, or `new StringSelectMenuBuilder()` directly instead of the panel kit helpers:
- `security/lib/verify-panel.ts:23-24`
- `security/lib/captcha.ts:68`
- `security/lib/panic-card.ts:20`
- `tempvc/ui/panel.ts:365`
- `mod/lib/warn-thresholds-panel.ts:108`
- `afk/listeners/messageCreate.ts:100`
- `core/commands/about.ts:175`

**Fix**: Replace with `#utilities/panels.js` equivalents (`buildSafeActionRows`, `createActionButton`, `createStringSelectMenu`), preserving current button/select behavior.

### HIGH-4 — Missing autocomplete for bounded options (Ground Rule 7)
- `tempvc/commands/tempvc.ts:71` — `name` option (template name) is unvalidated free text where a bounded set of templates exists.
- `mod/commands/ban.ts:90` — `delete_message_days` is a bounded numeric range without autocomplete/choices.
- `utility/commands/purge.ts:82` — `number` option similarly unbounded in UX even though the command enforces a range server-side.
- `core/commands/module.ts` — `install`/`uninstall`/`update`/`pin`/`unpin` subcommands have module-name autocomplete; `info`/`enable`/`disable`/`reload` do not, despite taking the same kind of module-name option.

**Fix**: Add `autocompleteRun` via `#utilities/autocomplete.js` helpers to each; extend `module.ts`'s existing autocomplete handler to cover all subcommands.

### HIGH-5 — Permit nodes registration (verified compliant, no action needed)
All permission-gated features checked resolve to nodes declared in `permit-nodes.ts`, either directly or via a registered wildcard (`mod.*`, `admin.*`, etc.). No missing registrations found.

### HIGH-6 — Dashboard RPC security handler runtime dependency on sibling module
Same root cause as CRITICAL-1: `security-rpc.ts` calls `tryGetUtility("security")` and `security.restoreFromBackup()` at runtime. Listed separately here because it's a *runtime* coupling (module load order dependency) in addition to the *type-level* import violation in CRITICAL-1 — fixing the type import alone would not fully resolve this without also relocating the restore-invocation logic.

### HIGH-7 — `module.ts` command missing autocomplete on several subcommands
Duplicate detail of HIGH-4's `module.ts` item, called out separately in the original sweep notes: `info`, `enable`, `disable`, `reload` subcommands lack autocomplete despite `install`, `uninstall`, `update`, `pin`, `unpin` having it. Same fix as HIGH-4.

---

## MEDIUM

### MEDIUM-1 — Import aliases (verified compliant)
No violations found; all internal package imports use `#alias/*.js` subpath imports with explicit `.js` suffixes matching `package.json` `imports` maps.

### MEDIUM-2 — Cross-package imports (verified compliant)
No relative traversal across package roots (`../../packages/...`) found; all cross-package references use `@lumi/<package>` workspace names.

### MEDIUM-3 — Addon SDK boundary (verified compliant)
`validateAddon()` in `packages/core/src/lib/downloader/validate.ts` performs static analysis on addon code and rejects imports outside the public `lumi` SDK surface (`lumi`, `lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`). No bypass found.

### MEDIUM-4 — Dashboard direct Redis (duplicate of HIGH-2)
Listed here only because the original sweep flagged Ground Rule 8 in two passes (RPC-bridge usage check and direct-import check); same underlying finding as HIGH-2, not a separate defect.

---

## LOW

### LOW-1 — Duplicate of HIGH-2 (dashboard Redis import), flagged again from `package.json` dependency-list sweep. No separate action needed beyond HIGH-2's fix.

### LOW-2 — Misleading comment in `permit-nodes.ts:2`
Comment states the dashboard-side permit metadata file "mirrors" this core file; in reality it extends the core node list with UI-only metadata (labels, descriptions) rather than mirroring it 1:1. Low-impact doc-accuracy fix.

---

## Compliance Matrix

| Rule | Status |
|---|---|
| 1. Zero Cross-Module Import | FAIL (CRITICAL-1) |
| 2. Database Access | PASS (wording ambiguity, HIGH-1) |
| 3. Cache Invalidation | FAIL (CRITICAL-2) |
| 4. Discord Embeds | PASS |
| 5. Panels & UI Kits | WARN (HIGH-3) |
| 6. Permit Nodes | PASS (HIGH-5) |
| 7. Bounded Autocomplete | WARN (HIGH-4/7) |
| 8. Dashboard ↔ Worker Isolation | FAIL (HIGH-2/MEDIUM-4/LOW-1) |
| 9. Import Aliases | PASS (MEDIUM-1) |
| 10. Addon SDK Boundary | PASS (MEDIUM-3) |

## Remediation Roadmap
- **Phase 1**: Fix CRITICAL-1 (cross-module import/backup extraction) and CRITICAL-2 (remove dead invalidation fallback branches).
- **Phase 2**: Fix HIGH-2 (dashboard Redis), HIGH-3 (panel kit adoption), HIGH-4/7 (autocomplete gaps).
- **Phase 3**: MEDIUM/LOW cleanup (LOW-2 comment fix; MEDIUM items are verified-clean, no action).

## Final Verdict: BLOCK
Two CRITICAL findings (cross-module import, cache-invalidation discipline) must be resolved before this shard's changes can merge.
