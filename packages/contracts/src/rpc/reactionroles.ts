import { s } from "@sapphire/shapeshift";
import type { ReactionRoleMenuView } from "../views";
import { rpcAction, RpcTimeouts } from "./define";
import { boundedArray, SnowflakeSchema } from "./schemas";

export const ReactionRoleMenuModes = ["buttons", "select", "reactions"] as const;

export type ReactionRoleMenuMode = (typeof ReactionRoleMenuModes)[number];

const ReactionRoleOptionSchema = s.object({
  id: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(32).optional(),
  label: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(80),
  emoji: s.string().lengthLessThanOrEqual(100).nullable().optional(),
  description: s.string().lengthLessThanOrEqual(100).nullable().optional(),
  roleId: SnowflakeSchema,
  requiredRoleId: SnowflakeSchema.nullable().optional(),
});

const MenuIdSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(40);

export const reactionrolesRpc = {
  "guild.reactionroles.menus.list": rpcAction<{
    menus: ReactionRoleMenuView[];
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List role menus for a guild.",
  }),
  "guild.reactionroles.menus.set": rpcAction<{
    success: boolean;
    menu: ReactionRoleMenuView;
  }>()({
    input: s.object({
      id: MenuIdSchema,
      title: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(100),
      description: s.string().lengthLessThanOrEqual(1000).nullable().optional(),
      color: s.string().lengthLessThanOrEqual(7).nullable().optional(),
      mode: s.enum(ReactionRoleMenuModes),
      exclusive: s.boolean().optional(),
      maxRoles: s.number().int().greaterThanOrEqual(1).lessThanOrEqual(25).optional(),
      options: boundedArray(ReactionRoleOptionSchema, { max: 25 }),
      /** Block layout replacing the title/description header; the options and
       * mode controls always stay appended below, since the pick handlers
       * dispatch on them. Clamped server-side. */
      richContent: s.unknown().optional(),
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
    input: s.object({ id: MenuIdSchema }),
    auth: "guildManager",
    requiresEnabled: "reactionroles",
    timeoutMs: RpcTimeouts.long,
    summary: "Delete a role menu.",
  }),
};
