import { z } from "zod";
import type { DownloaderRepoView, RepoModuleView } from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";

const SafeNameSchema = z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/);

export const downloaderRpc = {
  "downloader.repo.add": rpcAction<{ success: boolean }>()({
    input: z.object({
      name: z.string().min(1),
      url: z.url(),
      branch: z.string().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Register a module repo.",
  }),
  "downloader.repo.list": rpcAction<{ repos: DownloaderRepoView[] }>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "List registered repos.",
    readOnly: true,
  }),
  "downloader.repo.modules": rpcAction<{
    repoName: string;
    modules: RepoModuleView[];
  }>()({
    input: z.object({ repoName: z.string().min(1) }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "List modules a repo offers.",
    readOnly: true,
  }),
  "downloader.module.install": rpcAction<{
    success: boolean;
    moduleName: string;
  }>()({
    input: z.object({
      repoName: z.string().min(1),
      moduleName: z.string().min(1),
      revision: z.string().min(4).optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Install a module from a repo.",
  }),
  "downloader.module.uninstall": rpcAction<{
    success: boolean;
    moduleName: string;
  }>()({
    input: z.object({ moduleName: SafeNameSchema }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Uninstall a module.",
  }),
  "downloader.module.rollback": rpcAction<{
    success: boolean;
    moduleName: string;
    commit: string | null;
  }>()({
    input: z.object({
      moduleName: SafeNameSchema,
      revision: z.string().min(4),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Roll a module back to a revision.",
  }),
};
