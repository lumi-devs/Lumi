import { Package } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { RpcActions } from "@lumi/contracts";
import { RepoManager } from "#/components/system/repo-manager";
import { PageHeader } from "#/components/ui/page-header";

export default async function SystemAddonsPage() {
  const session = await requireBotOwner();
  const result = (await rpcCall(RpcActions.repoList, {
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
