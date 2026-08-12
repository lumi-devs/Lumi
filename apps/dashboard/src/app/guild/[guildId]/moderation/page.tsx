import Link from "next/link";
import { Gavel, PlugZap, SearchX } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildCases, getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModerationCasesTable } from "#/components/guild/moderation-cases-table";
import { Alert } from "#/components/ui/alert";
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
import type { CasesListData } from "#/lib/dashboard-data";
import {
  extractMemberNames,
  isSnowflake,
  pageNumber,
  single,
} from "#/lib/log-format";
import { CASE_ACTION_OPTIONS } from "#/lib/moderation-cases";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;

  const action = single(query["action"]);
  const userId = single(query["user"]);
  const moderatorId = single(query["moderator"]);
  const page = pageNumber(single(query["page"]));

  const rejected = [
    userId && !isSnowflake(userId) ? "Target user ID" : null,
    moderatorId && !isSnowflake(moderatorId) ? "Moderator ID" : null,
  ].filter((value): value is string => value !== null);

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const memberNames = extractMemberNames(dashboard.members);

  let data: CasesListData | null = null;
  let failure: string | null = null;
  try {
    data = await getGuildCases(guildId, session.userId, {
      page,
      pageSize: PAGE_SIZE,
      ...(action ? { action } : {}),
      ...(userId && isSnowflake(userId) ? { userId } : {}),
      ...(moderatorId && isSnowflake(moderatorId) ? { moderatorId } : {}),
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  const filtered = Boolean(action || userId || moderatorId);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Moderation cases"
          description="Every ban, kick, mute, warn and quarantine Lumi has recorded here. Revoking a case closes the record; it does not undo the action in Discord."
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
            <CardTitle>Case log</CardTitle>
            <CardDescription>
              Filter by action, by the member a case is against, or by the
              moderator who opened it.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "select",
                  name: "action",
                  label: "Action",
                  anyLabel: "All actions",
                  options: CASE_ACTION_OPTIONS,
                },
                {
                  type: "search",
                  name: "user",
                  label: "Target user ID",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                },
                {
                  type: "search",
                  name: "moderator",
                  label: "Moderator ID",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                },
              ]}
            />
            {rejected.length > 0 ? (
              <Alert variant="warning" className="mx-4 mb-3">
                {rejected.join(" and ")}{" "}
                {rejected.length > 1 ? "take" : "takes"} a Discord user ID — 15
                to 20 digits, copied with Developer Mode on. That filter is
                being ignored.
              </Alert>
            ) : null}
          </div>

          {failure !== null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Cases couldn't be loaded"
              description="The case list came back from the bot with an error. Check that the bot is online and connected to the message broker, then reload this page."
              footnote={failure}
            />
          ) : data && data.cases.length > 0 ? (
            <ModerationCasesTable
              guildId={guildId}
              cases={data.cases}
              memberNames={memberNames}
            />
          ) : data && data.total > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="This page is past the end of the log"
              description={`The log holds ${data.total} case${data.total === 1 ? "" : "s"}. Go back to the first page to see them.`}
              action={
                <Link
                  href={firstPageHref(guildId, action, userId, moderatorId)}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Go to first page
                </Link>
              }
            />
          ) : filtered ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No cases match these filters"
              description="Widen the action filter or clear the user IDs to see the whole log."
              action={
                <Link
                  href={`/guild/${guildId}/moderation`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Gavel}
              title="No moderation cases yet"
              description="Lumi opens a case every time a moderator bans, kicks, mutes, warns or quarantines someone. Set warn thresholds so repeat offenders escalate without anyone watching."
              action={
                <Link
                  href={`/guild/${guildId}/warn-thresholds`}
                  className={buttonVariants({ variant: "primary", size: "sm" })}
                >
                  Set warn thresholds
                </Link>
              }
            />
          )}

          {data && data.total > 0 ? (
            <CardFooter>
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                itemLabel="cases"
              />
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function firstPageHref(
  guildId: string,
  action: string,
  userId: string,
  moderatorId: string,
): string {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (userId) params.set("user", userId);
  if (moderatorId) params.set("moderator", moderatorId);
  const qs = params.toString();
  return `/guild/${guildId}/moderation${qs ? `?${qs}` : ""}`;
}
