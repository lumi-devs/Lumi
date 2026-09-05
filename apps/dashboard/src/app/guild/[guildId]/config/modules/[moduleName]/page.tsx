import { notFound } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModuleConfigForm } from "#/components/guild/module-config-form";
import { PageHeader } from "#/components/ui/page-header";

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={mod.displayName}
        description={mod.description}
        icon={SlidersHorizontal}
      />
      <ModuleConfigForm
        guildId={guildId}
        module={mod}
        roles={data.roles}
        channels={data.channels}
      />
    </div>
  );
}
