import type { PageServerLoad, Actions } from "./$types";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { serverConfig } from "$lib/server/env";
import { getPrisma } from "$lib/server/prisma";
import { isPrismaCode } from "$lib/server/prismaErrors";
import { assertCsrf, formString, parseInput } from "$lib/server/validation";

const RepoSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{0,63}$/, {
      message: "Use lowercase letters, digits, and dashes.",
    }),
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), {
      message: "Repository URLs must use HTTPS.",
    }),
  branch: z
    .string()
    .trim()
    .max(64)
    .refine(
      (value) => value === "" || /^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*$/.test(value),
      {
        message: "Invalid branch name.",
      },
    )
    .transform((value) => (value === "" ? null : value)),
});

const InstallSchema = z.object({
  repoId: z.coerce.number().int().positive(),
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{0,63}$/, {
      message: "Use lowercase letters, digits, and dashes.",
    }),
  version: z.string().trim().max(32),
  commit: z.string().trim().max(40),
});

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  version: z.string().trim().max(32),
  commit: z.string().trim().max(40),
});

const PinSchema = z.object({
  name: z.string().trim().min(1).max(64),
  pinned: z.boolean(),
});

interface Candidate {
  name: string;
  displayName: string;
  version: string;
  installed: boolean;
}

async function repoCandidates(
  repoName: string,
  installed: Set<string>,
): Promise<Candidate[]> {
  const cwd = process.cwd();
  const dataRoots = [
    resolve(serverConfig().dataDir),
    resolve(cwd, "data"),
    resolve(cwd, "../../data"),
    resolve(cwd, "../data"),
  ];
  for (const root of dataRoots) {
    const dir = join(root, "repos", repoName);
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const found: Candidate[] = [];
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        entry.name === "node_modules"
      ) {
        continue;
      }
      try {
        const raw = JSON.parse(
          await readFile(join(dir, entry.name, "manifest.json"), "utf-8"),
        ) as Record<string, unknown>;
        if (typeof raw.name !== "string") continue;
        found.push({
          name: raw.name,
          displayName:
            typeof raw.displayName === "string" ? raw.displayName : raw.name,
          version: typeof raw.version === "string" ? raw.version : "0.0.0",
          installed: installed.has(raw.name),
        });
      } catch {
        // Not a module directory.
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [];
}

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const prisma = getPrisma();

  const [repos, installed] = await Promise.all([
    prisma.downloaderRepo.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { modules: true } } },
    }),
    prisma.downloaderModule.findMany({
      orderBy: { name: "asc" },
      include: { repo: { select: { name: true } } },
    }),
  ]);

  const installedNames = new Set(installed.map((row) => row.name));
  const candidates = Object.fromEntries(
    await Promise.all(
      repos.map(async (repo) => [
        repo.name,
        await repoCandidates(repo.name, installedNames),
      ]),
    ),
  );

  return {
    repos: repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      url: repo.url,
      branch: repo.branch,
      commit: repo.commit,
      installed: repo._count.modules,
      candidates: candidates[repo.name] ?? [],
    })),
    installed: installed.map((row) => ({
      name: row.name,
      version: row.version,
      commit: row.commit,
      pinned: row.pinned,
      installedAt: row.installedAt.toISOString(),
      repoName: row.repo.name,
    })),
  };
};

export const actions: Actions = {
  addRepo: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(RepoSchema, {
      name: formString(data, "name"),
      url: formString(data, "url"),
      branch: formString(data, "branch"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    try {
      await getPrisma().downloaderRepo.create({
        data: {
          name: parsed.data.name,
          url: parsed.data.url,
          branch: parsed.data.branch,
        },
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "A repository with that name already exists.",
        });
      }
      console.error("[dashboard] addon repo add failed", error);
      return fail(500, { error: "Could not add the repository." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.repo_add",
      targetId: parsed.data.name,
      targetType: "downloader_repo",
    });
    return {
      success:
        "Repository registered. The bot must sync it before installing files.",
    };
  },

  updateRepo: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(RepoSchema, {
      id: formString(data, "id"),
      name: formString(data, "name"),
      url: formString(data, "url"),
      branch: formString(data, "branch"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });
    if (!parsed.data.id) return fail(400, { error: "Missing repository id." });

    try {
      const updated = await getPrisma().downloaderRepo.updateMany({
        where: { id: parsed.data.id },
        data: {
          name: parsed.data.name,
          url: parsed.data.url,
          branch: parsed.data.branch,
        },
      });
      if (updated.count === 0) {
        return fail(404, { error: "Repository not found." });
      }
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, {
          error: "A repository with that name already exists.",
        });
      }
      return fail(500, { error: "Could not update the repository." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.repo_update",
      targetId: String(parsed.data.id),
      targetType: "downloader_repo",
    });
    return { success: "Repository updated." };
  },

  install: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(InstallSchema, {
      repoId: formString(data, "repoId"),
      name: formString(data, "name"),
      version: formString(data, "version"),
      commit: formString(data, "commit"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const repo = await getPrisma().downloaderRepo.findUnique({
      where: { id: parsed.data.repoId },
    });
    if (!repo) return fail(404, { error: "Repository not found." });

    try {
      await getPrisma().downloaderModule.create({
        data: {
          name: parsed.data.name,
          repoId: repo.id,
          version: parsed.data.version || null,
          commit: parsed.data.commit || repo.commit,
        },
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return fail(409, { error: "That module is already installed." });
      }
      console.error("[dashboard] addon install failed", error);
      return fail(500, { error: "Could not install the module record." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.install",
      targetId: parsed.data.name,
      targetType: "downloader_module",
      changes: { repo: repo.name },
    });
    return {
      success:
        "Install record created. The bot's add-on manager will materialize files on its next sync.",
    };
  },

  update: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(UpdateSchema, {
      name: formString(data, "name"),
      version: formString(data, "version"),
      commit: formString(data, "commit"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const updated = await getPrisma().downloaderModule.updateMany({
      where: { name: parsed.data.name },
      data: {
        version: parsed.data.version || null,
        commit: parsed.data.commit || null,
      },
    });
    if (updated.count === 0) {
      return fail(404, { error: "Module not found." });
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.update",
      targetId: parsed.data.name,
      targetType: "downloader_module",
    });
    return { success: "Module record updated." };
  },

  pin: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(PinSchema, {
      name: formString(data, "name"),
      pinned: formString(data, "pinned") === "true",
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const updated = await getPrisma().downloaderModule.updateMany({
      where: { name: parsed.data.name },
      data: { pinned: parsed.data.pinned },
    });
    if (updated.count === 0) {
      return fail(404, { error: "Module not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.pin",
      targetId: parsed.data.name,
      targetType: "downloader_module",
      changes: { pinned: parsed.data.pinned },
    });
    return {
      success: parsed.data.pinned
        ? "Module pinned. Updates will skip it."
        : "Module unpinned.",
    };
  },
};
