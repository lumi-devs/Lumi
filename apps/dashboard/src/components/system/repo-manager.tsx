"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, GitBranch, PackagePlus } from "lucide-react";
import {
  addRepo,
  installModule,
  uninstallModule,
  listRepoModules,
  type RepoModuleView,
} from "#/actions/system-actions";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Field, Input } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Alert } from "#/components/ui/alert";
import { EmptyState } from "#/components/ui/empty-state";
import { ActionError } from "#/components/action-error";
import type { DownloaderRepoView } from "#/lib/dashboard-data";
import { cn, deriveRepoNameFromUrl } from "#/lib/utils";

/** dashboard.md §9A `AddonGitRepoManagerTable` + `InstalledAddonsGrid`. */
export function RepoManager({ repos: initial }: { repos: DownloaderRepoView[] }) {
  const [repos, setRepos] = useState(initial);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUrlBlur() {
    // Only auto-fill while the user hasn't typed a name of their own -
    // never clobber a manual edit.
    if (!name.trim() && url.trim()) {
      setName(deriveRepoNameFromUrl(url.trim()));
    }
  }

  function handleAdd() {
    setError(null);
    const effectiveName = name.trim() || deriveRepoNameFromUrl(url.trim());
    startTransition(async () => {
      const res = await addRepo(effectiveName, url, branch || undefined);
      if (!res.ok) {
        setError(res.error ?? "Failed to add repo");
        return;
      }
      setRepos((r) => [
        ...r,
        { id: Date.now(), name: effectiveName, url, branch: branch || "master", commit: null },
      ]);
      setName("");
      setUrl("");
      setBranch("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a repository</CardTitle>
          <CardDescription>
            Lumi clones the repo and makes its modules available to install.
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.5fr_1fr_0.7fr_auto]">
            <Field label="Git URL" htmlFor="repoUrl">
              <Input
                id="repoUrl"
                placeholder="https://github.com/owner/repo"
                className="font-mono text-[12px]"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
              />
            </Field>
            <Field label="Name (optional)" htmlFor="repoName">
              <Input
                id="repoName"
                placeholder="Derived from URL"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Branch" htmlFor="repoBranch">
              <Input
                id="repoBranch"
                placeholder="master"
                className="font-mono text-[12px]"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={!url || isPending}
              onClick={handleAdd}
              className="self-start sm:mt-[22px]"
            >
              <PackagePlus aria-hidden />
              {isPending ? "Adding…" : "Add repo"}
            </Button>
          </div>

          <ActionError error={error} />

          <Alert variant="warning">
            Third-party repositories run arbitrary code inside the bot process
            with full database access. Only add repositories you trust.
          </Alert>
        </CardBody>
      </Card>

      {repos.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitBranch}
            title="No addon repositories"
            description="Add a Git repository above to browse and install community modules."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {repos.map((r) => (
            <RepoRow key={r.name} repo={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RepoRow({ repo }: { repo: DownloaderRepoView }) {
  const [expanded, setExpanded] = useState(false);
  const [modules, setModules] = useState<RepoModuleView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleExpand() {
    setExpanded((e) => !e);
    if (!modules) {
      startTransition(async () => {
        const res = await listRepoModules(repo.name);
        if (res.ok) setModules(res.modules);
        else setError(res.error);
      });
    }
  }

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <Card>
      <button
        type="button"
        onClick={toggleExpand}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <Chevron className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{repo.name}</p>
          <p className="truncate font-mono text-[11px] text-fg-subtle">
            {repo.url}
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          <GitBranch className="size-3" aria-hidden />
          {repo.branch}
        </Badge>
        <span className="text-[12px] text-fg-muted">
          {expanded ? "Hide modules" : "Browse modules"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {isPending && !modules ? (
            <ModuleRowSkeleton />
          ) : error ? (
            <div className="p-3">
              <ActionError error={error} />
            </div>
          ) : modules && modules.length > 0 ? (
            <ul className="divide-y divide-border">
              {modules.map((m) => (
                <RepoModuleRow
                  key={m.name}
                  repoName={repo.name}
                  module={m}
                  onChange={(installed) =>
                    setModules(
                      (list) =>
                        list?.map((mod) =>
                          mod.name === m.name ? { ...mod, isInstalled: installed } : mod,
                        ) ?? null,
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={PackagePlus}
              title="No modules in this repository"
              description="The repo cloned successfully but contains no Lumi module manifests."
            />
          )}
        </div>
      )}
    </Card>
  );
}

function RepoModuleRow({
  repoName,
  module: m,
  onChange,
}: {
  repoName: string;
  module: RepoModuleView;
  onChange: (installed: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(installed: boolean) {
    setError(null);
    startTransition(async () => {
      const res = installed
        ? await installModule(repoName, m.name)
        : await uninstallModule(m.name);
      if (res.ok) onChange(installed);
      else setError(res.error ?? (installed ? "Install failed" : "Uninstall failed"));
    });
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[12px] text-fg">{m.name}</span>
          {m.version && (
            <span className="tabular text-[11px] text-fg-subtle">v{m.version}</span>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </div>

      {m.isInstalled ? (
        <>
          <Badge variant="success" dot>
            Installed
          </Badge>
          <Button
            variant="dangerGhost"
            size="sm"
            disabled={isPending}
            onClick={() => act(false)}
          >
            Uninstall
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => act(true)}
        >
          Install
        </Button>
      )}
    </li>
  );
}

function ModuleRowSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <span
            className={cn("skeleton h-3", i === 1 ? "w-40" : "w-28")}
          />
          <span className="skeleton ml-auto h-6 w-16" />
        </li>
      ))}
    </ul>
  );
}
