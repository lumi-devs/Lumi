import Link from "next/link";
import { PlugZap, TrendingUp } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildAuditLog, getGuildCases } from "#/lib/dashboard-fetch";
import { DataBreakdownChart } from "#/components/account/data-breakdown-chart";
import { StatsGrid } from "#/components/stats-grid";
import { buttonVariants } from "#/components/ui/button-variants";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import { caseActionLabel } from "#/lib/moderation-cases";
import { countBy, formatDay, groupByDay } from "#/lib/log-format";
import type { AuditListData, CasesListData } from "#/lib/dashboard-data";

// The window both charts describe. Everything on this page is counted from
// these rows, so the copy never claims a range wider than what was read.
const RecordWindow = 200;

export default async function GuildActivityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  let cases: CasesListData | null = null;
  let audit: AuditListData | null = null;
  let failure: string | null = null;
  try {
    [cases, audit] = await Promise.all([
      getGuildCases(guildId, session.userId, { page: 1, pageSize: RecordWindow }),
      getGuildAuditLog(guildId, session.userId, { page: 1, pageSize: RecordWindow }),
    ]);
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  const rows = cases?.cases ?? [];
  const byAction = Object.fromEntries(
    Object.entries(countBy(rows, "action")).map(([action, count]) => [
      caseActionLabel(action),
      count,
    ]),
  );
  const byDay = Object.fromEntries(
    groupByDay(rows, (c) => c.createdAt).map((group) => [
      group.label,
      group.items.length,
    ]),
  );
  const active = rows.filter((c) => c.active).length;
  const oldest = rows.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={TrendingUp}
          title="Activity & trends"
          description="What has actually been happening in this server — moderation actions by type and by day, counted from the most recent records."
          meta={
            oldest ? (
              <p className="text-[14px] text-fg-muted">
                Covering the last{" "}
                <span className="tabular text-fg">{rows.length}</span> cases, back
                to <span className="tabular text-fg">{formatDay(oldest.createdAt)}</span>.
              </p>
            ) : null
          }
        />
      </div>

      {failure !== null ? (
        <Card>
          <EmptyState
            compact
            icon={PlugZap}
            title="Activity couldn't be read"
            description="The bot answered with an error instead of the records. Check that it is online and connected to the message broker, then reload."
            footnote={failure}
          />
        </Card>
      ) : (
        <>
          <div
            className="rise"
            style={{ "--rise-delay": "70ms" } as React.CSSProperties}
          >
            <StatsGrid
              stats={[
                { label: "Cases on record", value: cases?.total ?? 0, countUp: true },
                {
                  label: "Still in force",
                  value: active,
                  tone: active > 0 ? "warning" : "default",
                },
                { label: "Audit entries", value: audit?.total ?? 0 },
                { label: "Action types", value: Object.keys(byAction).length },
              ]}
            />
          </div>

          <div
            className="rise grid gap-3 lg:grid-cols-2"
            style={{ "--rise-delay": "140ms" } as React.CSSProperties}
          >
            <Card>
              <CardHeader>
                <CardTitle>Actions by type</CardTitle>
                <CardDescription>
                  Which moderation actions this server actually leans on.
                </CardDescription>
              </CardHeader>
              {Object.keys(byAction).length > 0 ? (
                <CardBody>
                  <DataBreakdownChart data={byAction} />
                </CardBody>
              ) : (
                <EmptyState
                  compact
                  icon={TrendingUp}
                  title="No moderation actions yet"
                  description="Once a warn, mute, or ban is issued, the mix of actions shows up here."
                />
              )}
              <CardFooter>
                <Link
                  href={`/guild/${guildId}/moderation`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Open case database
                </Link>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions by day</CardTitle>
                <CardDescription>
                  Days with an unusual spike are usually a raid or a rule change.
                </CardDescription>
              </CardHeader>
              {Object.keys(byDay).length > 0 ? (
                <CardBody>
                  <DataBreakdownChart data={byDay} />
                </CardBody>
              ) : (
                <EmptyState
                  compact
                  icon={TrendingUp}
                  title="Nothing to plot yet"
                  description="A day appears here as soon as it has at least one moderation action."
                />
              )}
              <CardFooter>
                <Link
                  href={`/guild/${guildId}/monitoring/audit`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Open audit log
                </Link>
              </CardFooter>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
