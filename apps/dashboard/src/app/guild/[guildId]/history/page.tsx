import Link from "next/link";
import { History, PlugZap, SearchX } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildConfigHistory, getGuildDashboard } from "#/lib/dashboard-fetch";
import { ConfigHistoryList } from "#/components/guild/config-history-list";
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
import type { ConfigHistoryListData } from "#/lib/dashboard-data";
import { filterHref, isSnowflake, pageNumber, single } from "#/lib/log-format";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;

  const moduleName = single(query["module"]);
  const key = single(query["key"]);
  const actorId = single(query["actor"]);
  const page = pageNumber(single(query["page"]));

  const badActorFilter = Boolean(actorId) && !isSnowflake(actorId);

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const labels = buildModuleLabelIndex(dashboard.modules);
  const memberNames = Object.fromEntries(
    dashboard.members.map((m) => [m.id, m.displayName || m.username]),
  );

  let data: ConfigHistoryListData | null = null;
  let failure: string | null = null;
  try {
    data = await getGuildConfigHistory(guildId, session.userId, {
      page,
      pageSize: PAGE_SIZE,
      ...(moduleName ? { moduleName } : {}),
      ...(key ? { key } : {}),
      ...(actorId && !badActorFilter ? { actorId } : {}),
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  const filtered = Boolean(moduleName || key || actorId);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Settings history"
          description="Every config value this server has changed, newest first, with the value it held before. Putting one back changes that single setting and nothing else."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              data ? (
                <Badge variant="neutral" className="tabular">
                  {data.total} changes
                </Badge>
              ) : null
            }
          >
            <CardTitle>Change log</CardTitle>
            <CardDescription>
              Restoring writes a new change of its own, so nothing is ever lost
              from this list — you can always come back and undo the undo.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "select",
                  name: "module",
                  label: "Module",
                  anyLabel: "All modules",
                  options: dashboard.modules.map((m) => ({
                    value: m.name,
                    label: m.displayName || m.name,
                  })),
                },
                {
                  type: "search",
                  name: "key",
                  label: "Setting key",
                  placeholder: "e.g. logChannel",
                },
                {
                  type: "search",
                  name: "actor",
                  label: "Changed by (user ID)",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                },
              ]}
            />
            {badActorFilter ? (
              <Alert variant="warning" className="mx-4 mb-3">
                The changed-by filter takes a Discord user ID — 15 to 20 digits,
                copied with Developer Mode on. It is being ignored for this
                search.
              </Alert>
            ) : null}
          </div>

          {failure !== null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="The change log couldn't be read"
              description="The bot answered with an error instead of the history. Check that it is online and connected to the message broker, then reload."
              footnote={failure}
            />
          ) : data && data.entries.length > 0 ? (
            <ConfigHistoryList
              guildId={guildId}
              entries={data.entries}
              labels={labels}
              memberNames={memberNames}
            />
          ) : data && data.total > 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="This page is past the end of the log"
              description={`The filter matches ${data.total} ${data.total === 1 ? "change" : "changes"}. Go back to the first page to read them.`}
              action={
                <Link
                  href={filterHref(`/guild/${guildId}/history`, {
                    module: moduleName,
                    key,
                    actor: actorId,
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
              title="No changes match these filters"
              description="The setting key must match exactly as it is stored — pick the module first and clear the key to see everything it has recorded."
              action={
                <Link
                  href={`/guild/${guildId}/history`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={History}
              title="No settings have been changed yet"
              description="The first time anyone edits a module setting — from this dashboard or from Discord — the old and new values are recorded here so the change can be read and put back."
              action={
                <Link
                  href={`/guild/${guildId}/modules`}
                  className={buttonVariants({ variant: "primary", size: "sm" })}
                >
                  Configure a module
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
                itemLabel="changes"
              />
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
