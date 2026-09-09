/**
 * Section names the `/security` page attaches non-schema widgets to — the
 * panic console, the verification panel record, the backup list, the nuke
 * matrix. None of these are config fields, so the schema cannot carry them.
 *
 * These strings must match `section` in the security module's `configSchema`;
 * `tests/lib/security-widgets.test.ts` asserts they still do, so renaming a
 * section in core fails a test instead of silently dropping a widget.
 */
export const SecurityWidgets = {
  panic: "Panic mode",
  antiNuke: "Anti-nuke",
  joinGate: "Join gate",
  backups: "Backups",
} as const;
