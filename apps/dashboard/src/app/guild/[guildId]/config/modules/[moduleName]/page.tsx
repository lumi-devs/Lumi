import { notFound } from "next/navigation";
import { PlugZap, SlidersHorizontal } from "lucide-react";
import { FieldType } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard, getGuildLogClaims } from "#/lib/dashboard-fetch";
import { ModuleConfigForm } from "#/components/guild/module-config-form";
import { LogClaimsCard } from "#/components/guild/log-claims-card";
import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import type { LogClaimView, LogTypeOption } from "#/lib/dashboard-data";

export default async function GuildModuleConfigPage({
  params,
}: {
  params: Promise<{ guildId: string; moduleName: string }>;
}) {
  const { guildId, moduleName } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const mod = data.modules.find((m) => m.name === moduleName);
  if (!mod) notFound();

  const isLogging = moduleName === "logging";
  let claims: LogClaimView[] = [];
  let claimsFailure: string | null = null;
  if (isLogging) {
    try {
      claims = await getGuildLogClaims(guildId, session.userId);
    } catch (err) {
      claimsFailure = err instanceof Error ? err.message : "The request failed.";
    }
  }
  const logTypes: LogTypeOption[] = isLogging
    ? mod.configFields
        .filter((f) => f.type === FieldType.Channel)
        .map((f) => ({ key: f.key, label: f.label || f.key }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={mod.displayName}
        description={mod.description}
        icon={SlidersHorizontal}
      />
      {isLogging ? (
        claimsFailure !== null ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending log channel claims</CardTitle>
            </CardHeader>
            <EmptyState
              compact
              icon={PlugZap}
              title="Pending claims couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={claimsFailure}
            />
          </Card>
        ) : (
          <LogClaimsCard
            guildId={guildId}
            claims={claims}
            channels={data.channels}
            members={data.members}
            logTypes={logTypes}
          />
        )
      ) : null}
      <ModuleConfigForm
        guildId={guildId}
        module={mod}
        roles={data.roles}
        channels={data.channels}
      />
    </div>
  );
}
