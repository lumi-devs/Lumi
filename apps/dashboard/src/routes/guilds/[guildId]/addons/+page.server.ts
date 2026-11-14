import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "#lib/server/audit.js";
import {
  requireBotOwner,
  requireGuildForm,
  requireGuildId,
} from "#lib/server/auth.js";
import {
  addAddonRepo,
  fetchAddons,
  installAddon,
  pinAddon,
  removeAddonRepo,
  uninstallAddon,
  updateAddonRepo,
} from "#lib/server/rpc.js";
import { formString, parseInput } from "#lib/server/validation.js";
import type { Actions, PageServerLoad } from "./$types";

const ModuleName = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, {
    message: "Use lowercase letters, digits, and dashes.",
  });

const RepoSchema = z.object({
  name: ModuleName,
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
    .max(128)
    .refine(
      (value) =>
        value === "" ||
        (!value.startsWith("/") &&
          !value.endsWith("/") &&
          !value.includes("..") &&
          !/[\s~^:?*[\\]/.test(value)),
      { message: "Invalid branch name." },
    ),
});

const RepoNameSchema = z.object({
  name: ModuleName,
});

const InstallSchema = z.object({
  repo: ModuleName,
  name: ModuleName,
});

const PinSchema = z.object({
  name: ModuleName,
  pinned: z.boolean(),
});

const actionError = (error: string, status = 400) => fail(status, { error });

export const load: PageServerLoad = async (event) => {
  await requireGuildId(event);
  requireBotOwner(event);

  const catalog = await fetchAddons();
  return {
    catalog: catalog.ok ? catalog.data : null,
    rpcError: catalog.ok ? null : catalog.error,
  };
};

export const actions: Actions = {
  addRepo: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(RepoSchema, {
      name: formString(data, "name"),
      url: formString(data, "url"),
      branch: formString(data, "branch"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await addAddonRepo(
      parsed.data.name,
      parsed.data.url,
      parsed.data.branch,
    );
    if (!result.ok) return actionError(result.error);

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.repo_add",
      targetId: parsed.data.name,
      targetType: "downloader_repo",
    });
    return { success: `Repository "${parsed.data.name}" cloned and tracked.` };
  },

  removeRepo: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(RepoNameSchema, {
      name: formString(data, "name"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await removeAddonRepo(parsed.data.name);
    if (!result.ok) return actionError(result.error);

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.repo_remove",
      targetId: parsed.data.name,
      targetType: "downloader_repo",
    });
    return { success: `Repository "${parsed.data.name}" removed.` };
  },

  updateRepo: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(RepoNameSchema, {
      name: formString(data, "name"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await updateAddonRepo(parsed.data.name);
    if (!result.ok) return actionError(result.error);

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.repo_update",
      targetId: parsed.data.name,
      targetType: "downloader_repo",
    });

    const update = result.data.result;
    if (update.failures.length > 0) {
      return fail(422, {
        error: `Update rejected and rolled back: ${update.failures
          .map((entry) => `${entry.module}: ${entry.error}`)
          .join("; ")}`,
      });
    }
    if (!update.changed) {
      return { success: `"${parsed.data.name}" is already up to date.` };
    }
    return {
      success: `Updated ${update.updated.length} add-on(s)${
        update.pinned.length > 0
          ? `; skipped pinned ${update.pinned.join(", ")}`
          : ""
      }.`,
    };
  },

  install: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(InstallSchema, {
      repo: formString(data, "repo"),
      name: formString(data, "name"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await installAddon(parsed.data.repo, parsed.data.name);
    if (!result.ok) return actionError(result.error);

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.install",
      targetId: parsed.data.name,
      targetType: "downloader_module",
      changes: { repo: parsed.data.repo },
    });
    return {
      success: `Installed "${parsed.data.name}". The bot mounts it immediately.`,
    };
  },

  uninstall: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(RepoNameSchema, {
      name: formString(data, "name"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await uninstallAddon(parsed.data.name);
    if (!result.ok) return actionError(result.error);

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.addon.uninstall",
      targetId: parsed.data.name,
      targetType: "downloader_module",
    });
    return { success: `Uninstalled "${parsed.data.name}".` };
  },

  pin: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);
    requireBotOwner(event);

    const parsed = parseInput(PinSchema, {
      name: formString(data, "name"),
      pinned: formString(data, "pinned") === "true",
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const result = await pinAddon(parsed.data.name, parsed.data.pinned);
    if (!result.ok) return actionError(result.error);

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
