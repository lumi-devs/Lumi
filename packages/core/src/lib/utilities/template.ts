/**
 * Shared `{placeholder}` substitution for user-authored templates (welcome
 * cards, tempvc channel names, ...). Unknown placeholders are left as-is so a
 * typo in a template doesn't silently swallow the token.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? vars[key]! : match,
  );
}
