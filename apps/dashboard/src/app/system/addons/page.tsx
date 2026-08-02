import { requireBotOwner } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { RPC_ACTIONS } from "@lumi/contracts";
import { RepoManager } from "#/components/system/repo-manager";
import type { DownloaderRepoView } from "#/lib/dashboard-data";

export default async function SystemAddonsPage() {
  await requireBotOwner();
  const result = (await rpcCall(RPC_ACTIONS.repoList)) as {
    repos: DownloaderRepoView[];
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">Addon Repositories</h1>
        <p className="text-sm text-white/50">
          Manage third-party Git repositories and their installed modules.
        </p>
      </div>
      <RepoManager repos={result.repos} />
    </div>
  );
}
