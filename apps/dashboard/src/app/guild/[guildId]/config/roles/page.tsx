import { Ticket, PlugZap } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildDashboard,
  getGuildReactionRoleMenus,
} from "#/lib/dashboard-fetch";
import { ReactionRolesManager } from "#/components/guild/reactionroles-manager";
import { ReactionRolesPreviewPlayground } from "#/components/guild/reactionroles-preview-playground";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import type { ReactionRoleMenuView } from "#/lib/dashboard-data";

export default async function RolesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  const dashboard = await getGuildDashboard(guildId, session.userId);

  let menus: ReactionRoleMenuView[] | null = null;
  let menusFailure: string | null = null;
  try {
    menus = await getGuildReactionRoleMenus(guildId, session.userId);
  } catch (err) {
    menusFailure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={Ticket}
          title="Reaction roles"
          description="Self-serve role menus. Members claim roles with buttons, a multi-pick dropdown, or message reactions — with exclusive and gated options."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              menus ? (
                <Badge variant="neutral" className="tabular">
                  {menus.length} menu{menus.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          >
            <CardTitle>Menus</CardTitle>
            <CardDescription>
              A menu is a named set of role options. Edit everything here —
              then post it in Discord with /reactionroles menu post, or from
              the /reactionroles menu panel.
            </CardDescription>
          </CardHeader>

          {menusFailure !== null || menus === null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Menus couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={menusFailure ?? undefined}
            />
          ) : (
            <ReactionRolesManager
              guildId={guildId}
              menus={menus}
              roles={dashboard.roles}
            />
          )}
        </Card>
      </div>

      <div className="rise" style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
        <Card>
          <CardHeader>
            <CardTitle>See it in action — edit it live</CardTitle>
            <CardDescription>
              Draft a title, mode, and options and watch the exact menu card
              members see update instantly.
            </CardDescription>
          </CardHeader>
          <div className="p-4">
            <ReactionRolesPreviewPlayground />
          </div>
        </Card>
      </div>
    </div>
  );
}
