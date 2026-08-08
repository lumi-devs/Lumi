import { Scale, PlugZap, SearchX } from "lucide-react";
import Link from "next/link";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildAppeals, getGuildDashboard } from "#/lib/dashboard-fetch";
import { GuildAppealsTable } from "#/components/guild/guild-appeals-table";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button-variants";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { FilterBar } from "#/components/ui/filter-bar";
import { PageHeader } from "#/components/ui/page-header";
import { Pagination } from "#/components/ui/pagination";
import type { AppealsListData } from "#/lib/dashboard-data";
import { APPEAL_STATUS_OPTIONS, isAppealStatus } from "#/lib/appeals";
import { single } from "#/lib/log-format";

const PAGE_SIZE = 25;

export default async function AppealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;

  const statusParam = single(query["status"]);
  const status = isAppealStatus(statusParam) ? statusParam : undefined;
  const page = pageNumber(single(query["page"]));

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const memberNames = Object.fromEntries(
    dashboard.members.map((m) => [m.id, m.displayName || m.username]),
  );

  let data: AppealsListData | null = null;
  let failure: string | null = null;
  try {
    data = await getGuildAppeals(guildId, session.userId, {
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Appeals"
          description="Ban and timeout appeals a punished member submitted through the link DMed to them. Approve, deny, deny and blacklist, or dismiss each one."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              data ? (
                <Badge variant="neutral" className="tabular">
                  {data.total} total
                </Badge>
              ) : null
            }
          >
            <CardTitle>Submitted appeals</CardTitle>
            <CardDescription>
              Filter by review status. Pending appeals need a decision;
              reviewed ones keep a record of who decided and when.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "select",
                  name: "status",
                  label: "Status",
                  anyLabel: "All statuses",
                  options: APPEAL_STATUS_OPTIONS,
                },
              ]}
            />
          </div>

          {failure !== null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Appeals couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={failure}
            />
          ) : data && data.appeals.length > 0 ? (
            <GuildAppealsTable
              guildId={guildId}
              appeals={data.appeals}
              memberNames={memberNames}
            />
          ) : data && data.total > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="This page is past the end of the list"
              description={`The list holds ${data.total} appeal${data.total === 1 ? "" : "s"}. Go back to the first page to see them.`}
              action={
                <Link
                  href={firstPageHref(guildId, status)}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Go to first page
                </Link>
              }
            />
          ) : status ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No appeals match this filter"
              description="Clear the status filter to see every appeal."
              action={
                <Link
                  href={`/guild/${guildId}/appeals`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Clear filter
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Scale}
              title="No appeals yet"
              description="Lumi DMs an appeal link whenever a member is banned or timed out. Submissions land here for review."
            />
          )}

          {data && data.total > 0 ? (
            <CardFooter>
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                itemLabel="appeals"
              />
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function firstPageHref(guildId: string, status: string | undefined): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return `/guild/${guildId}/appeals${qs ? `?${qs}` : ""}`;
}

function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
