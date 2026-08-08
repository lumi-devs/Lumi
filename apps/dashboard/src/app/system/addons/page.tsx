import { requireBotOwner } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { RPC_ACTIONS } from "@lumi/contracts";
import { RepoManager } from "#/components/system/repo-manager";
import { PageHeader } from "#/components/ui/page-header";
import type { DownloaderRepoView } from "#/lib/dashboard-data";

export default async function SystemAddonsPage() {
  const session = await requireBotOwner();
  const result = (await rpcCall(RPC_ACTIONS.repoList, {
    actorId: session.userId,
  })) as {
    repos: DownloaderRepoView[];
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Addon Repositories"
        description="Manage third-party Git repositories and the modules installed from them."
      />
      <RepoManager repos={result.repos} />
    </div>
  );
}
