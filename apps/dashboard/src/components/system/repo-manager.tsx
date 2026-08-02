"use client";

import { useState, useTransition } from "react";
import {
  addRepo,
  installModule,
  uninstallModule,
  listRepoModules,
  type RepoModuleView,
} from "#/actions/system-actions";
import { Card } from "#/components/ui/card";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import type { DownloaderRepoView } from "#/lib/dashboard-data";
import { deriveRepoNameFromUrl } from "#/lib/utils";

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
        <p className="mb-3 text-sm font-semibold">Add addon repository</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr_0.7fr_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repoName">Name (optional)</Label>
            <Input
              id="repoName"
              placeholder="Derived from URL if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repoUrl">Git URL</Label>
            <Input
              id="repoUrl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="repoBranch">Branch</Label>
            <Input
              id="repoBranch"
              placeholder="master"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>
          <Button
            disabled={!url || isPending}
            onClick={handleAdd}
            className="self-end"
          >
            Add
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <p className="mt-3 text-xs text-white/40">
          Third-party repositories run arbitrary code inside the bot process.
          Only add repositories you trust.
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        {repos.map((r) => (
          <RepoRow key={r.name} repo={r} />
        ))}
        {repos.length === 0 && (
          <p className="text-sm text-white/40">No addon repositories configured.</p>
        )}
      </div>
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

  function handleInstall(moduleName: string) {
    startTransition(async () => {
      const res = await installModule(repo.name, moduleName);
      if (res.ok) {
        setModules((m) =>
          m?.map((mod) => (mod.name === moduleName ? { ...mod, isInstalled: true } : mod)) ?? null,
        );
      } else setError(res.error ?? "Install failed");
    });
  }

  function handleUninstall(moduleName: string) {
    startTransition(async () => {
      const res = await uninstallModule(moduleName);
      if (res.ok) {
        setModules((m) =>
          m?.map((mod) => (mod.name === moduleName ? { ...mod, isInstalled: false } : mod)) ?? null,
        );
      } else setError(res.error ?? "Uninstall failed");
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{repo.name}</p>
          <p className="truncate text-xs text-white/40">
            {repo.url} · <span className="font-mono">{repo.branch}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={toggleExpand}>
          {expanded ? "Hide modules" : "Browse modules"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          {isPending && !modules && <p className="text-xs text-white/40">Loading…</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          {modules?.map((m) => (
            <div key={m.name} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {m.name} {m.version && <span className="text-white/30">v{m.version}</span>}
              </span>
              {m.isInstalled ? (
                <div className="flex items-center gap-2">
                  <Badge variant="success">Installed</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleUninstall(m.name)}
                  >
                    Uninstall
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleInstall(m.name)}
                >
                  Install
                </Button>
              )}
            </div>
          ))}
          {modules?.length === 0 && (
            <p className="text-xs text-white/40">No modules found in this repo.</p>
          )}
        </div>
      )}
    </Card>
  );
}
