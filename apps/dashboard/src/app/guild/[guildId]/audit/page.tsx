import Link from "next/link";
import { ClipboardList, PlugZap, SearchX } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildAuditLog, getGuildDashboard } from "#/lib/dashboard-fetch";
import { AuditTimeline } from "#/components/audit-timeline";
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
import { buildModuleLabelIndex } from "#/lib/config-labels";
import type { AuditListData } from "#/lib/dashboard-data";
import {
  AUDIT_PLATFORM_OPTIONS,
  filterHref,
  formatShortDay,
  isSnowflake,
  pageNumber,
  single,
} from "#/lib/log-format";

const PAGE_SIZE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AuditPage({
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
  const platform = single(query["platform"]);
  const page = pageNumber(single(query["page"]));

  const badUserFilter = Boolean(userId) && !isSnowflake(userId);

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const labels = buildModuleLabelIndex(dashboard.modules);

  let data: AuditListData | null = null;
  let failure: string | null = null;
  try {
    data = await getGuildAuditLog(guildId, session.userId, {
      page,
      pageSize: PAGE_SIZE,
      ...(action ? { action } : {}),
      ...(userId && !badUserFilter ? { userId } : {}),
      ...(platform ? { platform } : {}),
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  const filtered = Boolean(action || userId || platform);
  const newest = data?.entries.at(0);
  const oldest = data?.entries.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Audit log"
          description="Everything Lumi has recorded happening in this server, newest first — who did it, where they did it from, and what the bot wrote down at the time."
          meta={
            newest && oldest ? (
              <p className="text-[12px] text-fg-muted">
                This page covers{" "}
                <span className="tabular text-fg">
                  {formatShortDay(oldest.createdAt)}
                </span>{" "}
                to{" "}
                <span className="tabular text-fg">
                  {formatShortDay(newest.createdAt)}
                </span>
                , in UTC.
              </p>
            ) : null
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              data ? (
                <Badge variant="neutral" className="tabular">
                  {data.total} recorded
                </Badge>
              ) : null
            }
          >
            <CardTitle>Ledger</CardTitle>
            <CardDescription>
              Entries are written in batches, so an action can take up to a
              minute to appear. Nothing here can be edited or deleted.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "search",
                  name: "action",
                  label: "Action contains",
                  placeholder: "e.g. config",
                },
                {
                  type: "search",
                  name: "user",
                  label: "Acting user ID",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                },
                {
                  type: "select",
                  name: "platform",
                  label: "Came from",
                  anyLabel: "Discord and dashboard",
                  options: AUDIT_PLATFORM_OPTIONS,
                },
              ]}
            />
            {badUserFilter ? (
              <Alert variant="warning" className="mx-4 mb-3">
                The acting user filter takes a Discord user ID — 15 to 20
                digits, copied with Developer Mode on. It is being ignored for
                this search.
              </Alert>
            ) : null}
          </div>

          {failure !== null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="The ledger couldn't be read"
              description="The bot answered with an error instead of the log. Check that it is online and connected to the message broker, then reload."
              footnote={failure}
            />
          ) : data && data.entries.length > 0 ? (
            <AuditTimeline
              entries={data.entries}
              labels={labels}
              roles={dashboard.roles}
              channels={dashboard.channels}
            />
          ) : data && data.total > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="This page is past the end of the ledger"
              description={`The filter matches ${data.total} ${data.total === 1 ? "entry" : "entries"}. Go back to the first page to read them.`}
              action={
                <Link
                  href={filterHref(`/guild/${guildId}/audit`, {
                    action,
                    user: userId,
                    platform,
                  })}
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
              title="Nothing matches this search"
              description="The action filter matches any part of the name, so a shorter word finds more. Clearing it shows the whole ledger."
              action={
                <Link
                  href={`/guild/${guildId}/audit`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="Nothing recorded yet"
              description="The first line lands here as soon as someone changes a setting, runs a moderation command, or acts on this server from the dashboard. Every line keeps who did it, when, and the values involved."
              action={
                <Link
                  href={`/guild/${guildId}/modules`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Go to modules
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
                itemLabel="entries"
              />
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
