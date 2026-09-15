import { Package } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { rpc } from "#/lib/rpc";
import { RepoManager } from "#/components/system/repo-manager";
import { PageHeader } from "#/components/ui/page-header";

export default async function SystemAddonsPage() {
  const session = await requireBotOwner();
  const result = (await rpc("downloader.repo.list", {
    actorId: session.userId,
  }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Addon Repositories"
        description="Manage third-party Git repositories and the modules installed from them."
        icon={Package}
      />
      <RepoManager repos={result.repos} />
    </div>
  );
}
