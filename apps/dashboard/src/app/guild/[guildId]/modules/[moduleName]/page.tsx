import { notFound } from "next/navigation";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { ModuleConfigForm } from "#/components/guild/module-config-form";

export default async function GuildModuleConfigPage({
  params,
}: {
  params: Promise<{ guildId: string; moduleName: string }>;
}) {
  const { guildId, moduleName } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const module = data.modules.find((m) => m.name === moduleName);
  if (!module) notFound();

  return <ModuleConfigForm guildId={guildId} module={module} />;
}
