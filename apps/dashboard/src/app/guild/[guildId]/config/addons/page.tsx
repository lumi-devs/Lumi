import { Package } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildShell } from "#/lib/guild-reads";
import { ModuleToggleGrid } from "#/components/guild/module-toggle-grid";
import { PageHeader } from "#/components/ui/page-header";
import { Badge } from "#/components/ui/badge";

export default async function GuildAddonsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const shell = await getGuildShell(guildId, session.userId);

  const modules = shell.modules.filter((m) => m.isAddon);
  const enabled = modules.filter((m) => m.enabled).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Addons"
        description="Third-party modules loaded from an addon repository, separate from the bot's core features."
        icon={Package}
        actions={
          modules.length > 0 ? (
            <Badge variant="neutral">
              {enabled} of {modules.length} enabled
            </Badge>
          ) : undefined
        }
      />
      <ModuleToggleGrid
        guildId={guildId}
        modules={modules}
        emptyTitle="No addons installed"
        emptyDescription="This guild has no addon modules loaded. Install one from the system addon repositories to see it here."
      />
    </div>
  );
}
