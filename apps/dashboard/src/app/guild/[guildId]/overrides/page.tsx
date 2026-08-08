import Link from "next/link";
import { PlugZap, SearchX } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard, getGuildOverrides } from "#/lib/dashboard-fetch";
import { OverridesBoard } from "#/components/guild/overrides-board";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button-variants";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { FilterBar } from "#/components/ui/filter-bar";
import { PageHeader } from "#/components/ui/page-header";
import type { ConfigOverrideView } from "#/lib/dashboard-data";
import { single } from "#/lib/log-format";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OverridesPage({
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

  const dashboard = await getGuildDashboard(guildId, session.userId);

  let overrides: ConfigOverrideView[] | null = null;
  let failure: string | null = null;
  try {
    overrides = await getGuildOverrides(
      guildId,
      session.userId,
      moduleName || undefined,
    );
  } catch (err) {
    failure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Overrides"
          description="Exceptions to this server's module settings. Each one replaces a single setting for a single channel, category, role or member; everything else keeps the server-wide value."
          meta={
            overrides ? (
              <Badge variant="neutral" className="tabular">
                {overrides.length}{" "}
                {overrides.length === 1 ? "override" : "overrides"}
                {moduleName ? " in this module" : " in this server"}
              </Badge>
            ) : null
          }
        />
      </div>

      <div
        className="rise"
        style={{ "--rise-delay": "70ms" } as React.CSSProperties}
      >
        <Card>
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
            ]}
          />
        </Card>
      </div>

      {failure !== null ? (
        <Card>
          <CardHeader>
            <CardTitle>Overrides</CardTitle>
            <CardDescription>
              Nothing on this screen can be changed until the bot answers.
            </CardDescription>
          </CardHeader>
          <EmptyState
            compact
            icon={PlugZap}
            title="The overrides couldn't be read"
            description="The bot answered with an error instead of the list. Check that it is online and connected to the message broker, then reload."
            footnote={failure}
          />
        </Card>
      ) : moduleName && overrides && overrides.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="This module has no overrides"
            description="Every channel, role and member uses its server-wide settings. Other modules may still have exceptions of their own."
            action={
              <Link
                href={`/guild/${guildId}/overrides`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Show all modules
              </Link>
            }
          />
        </Card>
      ) : (
        <OverridesBoard
          guildId={guildId}
          overrides={overrides ?? []}
          modules={dashboard.modules}
          directory={{
            channels: dashboard.channels,
            roles: dashboard.roles,
            members: dashboard.members,
          }}
        />
      )}
    </div>
  );
}
