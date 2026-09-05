import Link from "next/link";
import { PlugZap, SearchX } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildBlocklist, getGuildDashboard } from "#/lib/dashboard-fetch";
import { exportGuildBlocklist } from "#/actions/guild-export-actions";
import { GuildBlocklistTable } from "#/components/guild/guild-blocklist-table";
import { DataBreakdownChart } from "#/components/account/data-breakdown-chart";
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
import { PageHeader } from "#/components/ui/page-header";
import { Pagination } from "#/components/ui/pagination";
import type { BlocklistEntryView, BlocklistListData } from "#/lib/dashboard-data";
import {
  countBy,
  extractMemberNames,
  pageNumber,
  single,
} from "#/lib/log-format";

const PAGE_SIZE = 25;

export default async function BlocklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;

  const page = pageNumber(single(query["page"]));

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const memberNames = extractMemberNames(dashboard.members);

  let data: BlocklistListData | null = null;
  let failure: string | null = null;
  try {
    data = await getGuildBlocklist(guildId, session.userId, {
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Blocklist"
          description="People who may not use Lumi in this server. Blocking is about the bot, not about Discord — it doesn't mute, kick or ban anyone."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              data ? (
                <>
                  <Badge variant="neutral" className="tabular">
                    {data.total} blocked
                  </Badge>
                  {data.total > 0 ? (
                    <ExportLogButton<BlocklistEntryView>
                      label="Download"
                      filename={`lumi-blocklist-${guildId}-${Date.now()}.json`}
                      action={exportGuildBlocklist.bind(null, guildId)}
                    />
                  ) : null}
                </>
              ) : null
            }
          >
            <CardTitle>Blocked in this server</CardTitle>
            <CardDescription>
              Every command a blocked member runs is refused before it does
              anything. Lumi&rsquo;s owners keep a separate bot-wide list that
              applies everywhere and can&rsquo;t be cleared from here.
            </CardDescription>
          </CardHeader>

          {failure !== null || data === null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="The blocklist couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={failure ?? undefined}
            />
          ) : (
            <>
              {data.entries.length > 1 ? (
                <div className="border-b border-border px-4 py-3">
                  <p className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                    Entries on this page, by who blocked them
                  </p>
                  <DataBreakdownChart
                    data={countBy<BlocklistEntryView>(data.entries, "blockedBy")}
                  />
                </div>
              ) : null}
              <GuildBlocklistTable
                guildId={guildId}
                entries={data.entries}
                memberNames={memberNames}
                pastEnd={
                  data.entries.length === 0 && data.total > 0 ? (
                    <EmptyState
                      compact
                      icon={SearchX}
                      title="This page is past the end of the list"
                      description={`${data.total} user${data.total === 1 ? " is" : "s are"} blocked here. Go back to the first page to see them.`}
                      action={
                        <Link
                          href={`/guild/${guildId}/moderation/blocklist`}
                          className={buttonVariants({
                            variant: "secondary",
                            size: "sm",
                          })}
                        >
                          Go to first page
                        </Link>
                      }
                    />
                  ) : null
                }
              />
              {data.total > 0 ? (
                <CardFooter>
                  <Pagination
                    page={data.page}
                    pageSize={data.pageSize}
                    total={data.total}
                    itemLabel="blocked users"
                  />
                </CardFooter>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
