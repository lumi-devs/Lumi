import { PlugZap } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemBlocklist } from "#/lib/dashboard-fetch";
import { GlobalBlocklistPanel } from "#/components/system/global-blocklist-panel";
import { Badge } from "#/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import type { BlocklistListData } from "#/lib/dashboard-data";
import { pageNumber, single } from "#/lib/log-format";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SystemBlocklistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireBotOwner();
  const query = await searchParams;
  const page = pageNumber(single(query["page"]));

  let data: BlocklistListData | null = null;
  let failure: string | null = null;
  try {
    data = await getSystemBlocklist(session.userId, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Global blocklist"
          description="Users Lumi refuses to answer anywhere. A block applies in every server the bot is in, on slash commands, prefix commands and context menus alike."
          actions={<Badge variant="outline">All servers</Badge>}
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        {failure !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Global blocklist</CardTitle>
              <CardDescription>
                Nobody can be blocked or unblocked until the bot answers.
              </CardDescription>
            </CardHeader>
            <EmptyState
              compact
              icon={PlugZap}
              title="The blocklist couldn't be read"
              description="The bot answered with an error instead of the list. Check that it is online and connected to the message broker, then reload."
              footnote={failure}
            />
          </Card>
        ) : (
          <GlobalBlocklistPanel
            entries={data?.entries ?? []}
            page={data?.page ?? page}
            pageSize={data?.pageSize ?? PAGE_SIZE}
            total={data?.total ?? 0}
          />
        )}
      </div>
    </div>
  );
}
