import { z } from "zod";
import type { ReactionRoleMenuView } from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import { boundedArray, SnowflakeSchema } from "./schemas.js";

export const ReactionRoleMenuModes = ["buttons", "select", "reactions"] as const;

export type ReactionRoleMenuMode = (typeof ReactionRoleMenuModes)[number];

const ReactionRoleOptionSchema = z.object({
  id: z.string().min(1).max(32).optional(),
  label: z.string().min(1).max(80),
  emoji: z.string().max(100).nullable().optional(),
  description: z.string().max(100).nullable().optional(),
  roleId: SnowflakeSchema,
  requiredRoleId: SnowflakeSchema.nullable().optional(),
});

const MenuIdSchema = z.string().min(1).max(40);

export const reactionrolesRpc = {
  "guild.reactionroles.menus.list": rpcAction<{
    menus: ReactionRoleMenuView[];
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List role menus for a guild.",
    readOnly: true,
  }),
  "guild.reactionroles.menus.set": rpcAction<{
    success: boolean;
    menu: ReactionRoleMenuView;
  }>()({
    input: z.object({
      id: MenuIdSchema,
      title: z.string().min(1).max(100),
      description: z.string().max(1000).nullable().optional(),
      color: z.string().max(7).nullable().optional(),
      mode: z.enum(ReactionRoleMenuModes),
      exclusive: z.boolean().optional(),
      maxRoles: z.number().int().gte(1).lte(25).optional(),
      options: boundedArray(ReactionRoleOptionSchema, { max: 25 }),
      /** Block layout replacing the title/description header; the options and
       * mode controls always stay appended below, since the pick handlers
       * dispatch on them. Clamped server-side. */
      richContent: z.unknown().optional(),
    }),
    auth: "guildManager",
    requiresEnabled: "reactionroles",
    timeoutMs: RpcTimeouts.long,
    summary: "Create or update a role menu with its options.",
  }),
  "guild.reactionroles.menus.delete": rpcAction<{
    success: boolean;
    id: string;
    deleted: boolean;
  }>()({
    input: z.object({ id: MenuIdSchema }),
    auth: "guildManager",
    requiresEnabled: "reactionroles",
    timeoutMs: RpcTimeouts.long,
    summary: "Delete a role menu.",
  }),
};
