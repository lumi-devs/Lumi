import { AlertTriangle, PlugZap } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildWarnThresholds } from "#/lib/dashboard-fetch";
import { WarnThresholdLadder } from "#/components/guild/warn-threshold-ladder";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import type { WarnThresholdView } from "#/lib/dashboard-data";

export default async function WarnThresholdsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  let thresholds: WarnThresholdView[] | null = null;
  let failure: string | null = null;
  try {
    thresholds = await getGuildWarnThresholds(guildId, session.userId);
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={AlertTriangle}
          title="Warn thresholds"
          description="Rules that let a warn escalate on its own. Warns are counted per member across the whole server."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              thresholds ? (
                <Badge variant="neutral" className="tabular">
                  {thresholds.length} rule{thresholds.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          >
            <CardTitle>Escalation ladder</CardTitle>
            <CardDescription>
              One rule fires per warn — the highest one at or below the
              member&rsquo;s warn count. Rules don&rsquo;t stack, so a member on
              5 warns gets the 5-warn action, not the 3-warn one as well.
            </CardDescription>
          </CardHeader>

          {failure !== null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Thresholds couldn't be loaded"
              description="The rule list came back from the bot with an error. Check that the bot is online and connected to the message broker, then reload this page."
              footnote={failure}
            />
          ) : (
            <WarnThresholdLadder guildId={guildId} thresholds={thresholds ?? []} />
          )}
        </Card>
      </div>
    </div>
  );
}
