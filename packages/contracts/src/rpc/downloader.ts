import { s } from "@sapphire/shapeshift";
import type { DownloaderRepoView, RepoModuleView } from "../views";
import { rpcAction, RpcTimeouts } from "./define";

const SafeNameSchema = s.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

export const downloaderRpc = {
  "downloader.repo.add": rpcAction<{ success: boolean }>()({
    input: s.object({
      name: s.string().lengthGreaterThanOrEqual(1),
      url: s.string().url(),
      branch: s.string().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Register a module repo.",
  }),
  "downloader.repo.list": rpcAction<{ repos: DownloaderRepoView[] }>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "List registered repos.",
  }),
  "downloader.repo.modules": rpcAction<{
    repoName: string;
    modules: RepoModuleView[];
  }>()({
    input: s.object({ repoName: s.string().lengthGreaterThanOrEqual(1) }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "List modules a repo offers.",
  }),
  "downloader.module.install": rpcAction<{
    success: boolean;
    moduleName: string;
  }>()({
    input: s.object({
      repoName: s.string().lengthGreaterThanOrEqual(1),
      moduleName: s.string().lengthGreaterThanOrEqual(1),
      revision: s.string().lengthGreaterThanOrEqual(4).optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Install a module from a repo.",
  }),
  "downloader.module.uninstall": rpcAction<{
    success: boolean;
    moduleName: string;
  }>()({
    input: s.object({ moduleName: SafeNameSchema }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Uninstall a module.",
  }),
  "downloader.module.rollback": rpcAction<{
    success: boolean;
    moduleName: string;
    commit: string | null;
  }>()({
    input: s.object({
      moduleName: SafeNameSchema,
      revision: s.string().lengthGreaterThanOrEqual(4),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Roll a module back to a revision.",
  }),
};
