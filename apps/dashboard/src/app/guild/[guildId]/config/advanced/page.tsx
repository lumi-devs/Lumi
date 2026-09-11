import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildAfkEntries,
  getGuildDashboard,
  getGuildIgnoredChannels,
  getGuildModuleData,
} from "#/lib/dashboard-fetch";
import { AfkList } from "#/components/guild/afk-list";
import { IgnoredChannelsList } from "#/components/guild/ignored-channels-list";
import { ModuleDataTable } from "#/components/guild/module-data-table";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FilterBar } from "#/components/ui/filter-bar";
import { LoadFailure } from "#/components/ui/load-failure";
import { PageHeader } from "#/components/ui/page-header";
import { Pagination } from "#/components/ui/pagination";
import { isCommandChannel } from "#/lib/channel-types";
import { guildManagementGroups } from "#/lib/guild-nav";

const PageSize = 25;

export default async function AdvancedPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;

  const navIcon = guildManagementGroups(guildId)
    .flatMap((g) => g.links)
    .find((l) => l.href === `/guild/${guildId}/config/advanced`)?.icon;

  const moduleName = single(query["module"]);
  const targetId = single(query["target"]);
  const key = single(query["key"]);
  const page = pageNumber(single(query["page"]));

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const commandChannels = dashboard.channels.filter((c) =>
    isCommandChannel(c.type),
  );

  const [afk, ignored, moduleData] = await Promise.all([
    settle(getGuildAfkEntries(guildId, session.userId)),
    settle(getGuildIgnoredChannels(guildId, session.userId)),
    settle(
      getGuildModuleData(guildId, session.userId, {
        page,
        pageSize: PageSize,
        ...(moduleName ? { moduleName } : {}),
        ...(targetId ? { targetId } : {}),
        ...(key ? { key } : {}),
      }),
    ),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={navIcon}
          title="Advanced"
          description="Three things that don't warrant a screen of their own: who's away, where Lumi stays quiet, and what its modules have written down."
        />
      </div>

      <div
        className="rise grid gap-4 lg:grid-cols-2"
        style={{ "--rise-delay": "70ms" } as React.CSSProperties}
      >
        <Card>
          <CardHeader
            actions={
              afk.data ? (
                <Badge variant="neutral" className="tabular">
                  {afk.data.length} away
                </Badge>
              ) : null
            }
          >
            <CardTitle>Away members</CardTitle>
            <CardDescription>
              Set and cleared by members themselves. Read-only here — clearing
              someone&rsquo;s AFK for them would just hide that they&rsquo;re
              gone.
            </CardDescription>
          </CardHeader>
          {afk.data ? (
            <AfkList
              entries={afk.data}
              members={dashboard.members}
              now={Date.now()}
            />
          ) : (
            <LoadFailure
              what="The AFK list"
              error={afk.error}
              description="Check that the bot is online and connected to the message broker, then reload this page. The other panels on this page are unaffected."
            />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ignored channels</CardTitle>
            <CardDescription>
              Where Lumi refuses commands. Anything that runs on its own —
              logging, auto-moderation, anti-nuke — is unaffected.
            </CardDescription>
          </CardHeader>
          {ignored.data ? (
            <IgnoredChannelsList
              guildId={guildId}
              entries={ignored.data}
              channels={commandChannels}
            />
          ) : (
            <LoadFailure
              what="The ignore list"
              error={ignored.error}
              description="Check that the bot is online and connected to the message broker, then reload this page. The other panels on this page are unaffected."
            />
          )}
        </Card>
      </div>

      <div className="rise" style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              moduleData.data ? (
                <Badge variant="neutral" className="tabular">
                  {moduleData.data.total} values
                </Badge>
              ) : null
            }
          >
            <CardTitle>Stored module state</CardTitle>
            <CardDescription>
              What each module has written for this server, as stored. Nothing
              here is editable — a module owns its own state and a hand-edited
              value would be overwritten or misread.
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
                    label: m.displayName,
                  })),
                },
                {
                  type: "search",
                  name: "target",
                  label: "Target",
                  placeholder: "User, channel or role ID",
                },
                {
                  type: "search",
                  name: "key",
                  label: "Key",
                  placeholder: "e.g. starboard_message",
                },
              ]}
            />
          </div>

          {moduleData.data ? (
            <>
              <ModuleDataTable
                entries={moduleData.data.entries}
                modules={dashboard.modules}
              />
              {moduleData.data.total > 0 ? (
                <CardFooter>
                  <Pagination
                    page={moduleData.data.page}
                    pageSize={moduleData.data.pageSize}
                    total={moduleData.data.total}
                    itemLabel="values"
                  />
                </CardFooter>
              ) : null}
            </>
          ) : (
            <LoadFailure
              what="Stored module state"
              error={moduleData.error}
              description="Check that the bot is online and connected to the message broker, then reload this page. The other panels on this page are unaffected."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

async function settle<T>(
  promise: Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await promise, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "The request failed.",
    };
  }
}

function single(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
