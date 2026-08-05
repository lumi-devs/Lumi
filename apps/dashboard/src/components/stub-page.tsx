import type { LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Badge } from "#/components/ui/badge";

/**
 * Placeholder for a dashboard.md §9 UI component this rewrite didn't build
 * out. Each usage names the exact Prisma model(s) and the spec's UI component
 * name so wiring up the real page later is a matter of copying the pattern
 * from guild/[guildId]/modules/[moduleName]/page.tsx (dynamic form) or
 * guild/[guildId]/modules/page.tsx (list + toggle) — both are already
 * RPC-wired end to end and can be used as the template.
 *
 * Presentationally this is now a titled panel with a designed empty state
 * instead of a card whose entire visible content was a yellow TODO badge and
 * a spec reference. Thirteen routes render this, so it set the tone for the
 * whole product; the engineering breadcrumbs are kept but demoted to a
 * monospace footnote.
 */
export function StubPage({
  icon,
  title,
  specComponent,
  models,
  description,
}: {
  icon: LucideIcon;
  title: string;
  /** dashboard.md §9 component name, e.g. "ModerationCaseManagerTable". */
  specComponent: string;
  /** Prisma model(s) this page will read/write once implemented. */
  models: string[];
  description: string;
}) {
  return (
    <Card>
      <CardHeader actions={<Badge variant="warning">Not built yet</Badge>}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <EmptyState
        compact
        icon={icon}
        title="This screen isn't wired up yet"
        description="The data behind it is already available over RPC — only the UI is missing. Until then, manage this from Lumi's in-Discord panels."
        footnote={`${specComponent} · ${models.join(", ")}`}
      />
    </Card>
  );
}
