import Link from "next/link";
import { ClipboardList, PlugZap, SearchX } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemAuditLog } from "#/lib/dashboard-fetch";
import { exportSystemAuditLog } from "#/actions/system-export-actions";
import { AuditTimeline } from "#/components/audit-timeline";
import { DataBreakdownChart } from "#/components/account/data-breakdown-chart";
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
import { ExportLogButton } from "#/components/ui/export-log-button";
import { FilterBar } from "#/components/ui/filter-bar";
import { PageHeader } from "#/components/ui/page-header";
import { Pagination } from "#/components/ui/pagination";
import type { AuditEntryView, AuditListData } from "#/lib/dashboard-data";
import {
  AUDIT_PLATFORM_OPTIONS,
  countBy,
  filterHref,
  formatShortDay,
  isSnowflake,
  pageNumber,
  single,
} from "#/lib/log-format";

const PAGE_SIZE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SystemAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireBotOwner();
  const query = await searchParams;

  const action = single(query["action"]);
  const userId = single(query["user"]);
  const guildId = single(query["guild"]);
  const platform = single(query["platform"]);
  const page = pageNumber(single(query["page"]));

  const rejected = [
    userId && !isSnowflake(userId) ? "Acting user ID" : null,
    guildId && !isSnowflake(guildId) ? "Server ID" : null,
  ].filter((value): value is string => value !== null);

  let data: AuditListData | null = null;
  let failure: string | null = null;
  try {
    data = await getSystemAuditLog(session.userId, {
      page,
      pageSize: PAGE_SIZE,
      ...(action ? { action } : {}),
      ...(userId && isSnowflake(userId) ? { userId } : {}),
      ...(guildId && isSnowflake(guildId) ? { guildId } : {}),
      ...(platform ? { platform } : {}),
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  const filtered = Boolean(action || userId || guildId || platform);
  const scoped = Boolean(guildId) && isSnowflake(guildId);
  const newest = data?.entries.at(0);
  const oldest = data?.entries.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Audit log"
          description="Every server Lumi is in, on one rail. This is the only place a recorded action can be read without managing the server it happened in."
          actions={<Badge variant="outline">All servers</Badge>}
          meta={
            newest && oldest ? (
              <p className="text-[14px] text-fg-muted">
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
                <>
                  <Badge variant="neutral" className="tabular">
                    {data.total} recorded
                  </Badge>
                  {data.total > 0 ? (
                    <ExportLogButton<AuditEntryView>
                      label="Download"
                      filename={`lumi-system-audit-log-${Date.now()}.json`}
                      action={exportSystemAuditLog.bind(null, {
                        ...(action ? { action } : {}),
                        ...(userId && isSnowflake(userId) ? { userId } : {}),
                        ...(guildId && isSnowflake(guildId) ? { guildId } : {}),
                        ...(platform ? { platform } : {}),
                      })}
                    />
                  ) : null}
                </>
              ) : null
            }
          >
            <CardTitle>
              {scoped ? "Ledger for one server" : "Ledger across every server"}
            </CardTitle>
            <CardDescription>
              Entries are written in batches, so an action can take up to a
              minute to appear. Narrow to a single server with the ID filter, or
              by clicking the ID on any row.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "search",
                  name: "guild",
                  label: "Server ID",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                },
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
            {rejected.length > 0 ? (
              <Alert variant="warning" className="mx-4 mb-3">
                {rejected.join(" and ")}{" "}
                {rejected.length > 1 ? "take" : "takes"} a Discord ID — 15 to 20
                digits, copied with Developer Mode on.{" "}
                {rejected.length > 1 ? "Those filters are" : "That filter is"}{" "}
                being ignored for this search.
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
            <>
              {data.entries.length > 1 ? (
                <div className="border-b border-border px-4 py-3">
                  <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                    Actions on this page
                  </p>
                  <DataBreakdownChart data={countBy<AuditEntryView>(data.entries, "action")} />
                </div>
              ) : null}
              <AuditTimeline
                entries={data.entries}
                guildHref={(id) =>
                  filterHref("/system/audit", {
                    guild: id,
                    action,
                    user: userId,
                    platform,
                  })
                }
              />
            </>
          ) : data && data.total > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="This page is past the end of the ledger"
              description={`The filter matches ${data.total} ${data.total === 1 ? "entry" : "entries"}. Go back to the first page to read them.`}
              action={
                <Link
                  href={filterHref("/system/audit", {
                    guild: guildId,
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
              description="A server with no entries is one where nothing has been recorded yet, not one Lumi has left. Clearing the filters shows every server again."
              action={
                <Link
                  href="/system/audit"
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
              description="The first line lands here as soon as anyone changes a setting, runs a moderation command, or acts from the dashboard — in any server Lumi is in."
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
