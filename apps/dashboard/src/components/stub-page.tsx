import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";

/**
 * Placeholder for a dashboard.md §9 UI component this rewrite didn't build
 * out. Each usage names the exact Prisma model(s) and the spec's UI
 * component name so wiring up the real page later is a matter of copying
 * the pattern from guild/[guildId]/modules/[moduleName]/page.tsx (dynamic
 * form) or guild/[guildId]/modules/page.tsx (grid + toggle) — both are
 * already RPC-wired end to end and can be used as the template.
 */
export function StubPage({
  emoji,
  title,
  specComponent,
  models,
  description,
}: {
  emoji: string;
  title: string;
  /** dashboard.md §9 component name, e.g. "ModerationCaseManagerTable". */
  specComponent: string;
  /** Prisma model(s) this page will read/write once implemented. */
  models: string[];
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <span className="text-2xl">{emoji}</span>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-wrap items-center gap-2 text-sm text-white/50">
        <Badge variant="warning">TODO</Badge>
        <span>
          dashboard.md §9 — <code className="text-white/70">{specComponent}</code>
        </span>
        <span className="text-white/30">·</span>
        <span>
          Prisma model{models.length > 1 ? "s" : ""}:{" "}
          {models.map((m) => (
            <code key={m} className="mr-1 text-white/70">
              {m}
            </code>
          ))}
        </span>
      </div>
    </Card>
  );
}
