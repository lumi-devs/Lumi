import { asIdList, isSnowflake } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { TicketsConfigKey, TicketsModuleName } from "./constants.js";

export const TicketQuestionSchema = z.object({
  label: z.string().trim().min(1).max(45),
  placeholder: z.string().trim().max(100).optional(),
  required: z.boolean().default(false),
  style: z.enum(["short", "long"]).default("short"),
  maxLength: z.number().int().min(1).max(1024).optional(),
});

export type TicketQuestion = z.infer<typeof TicketQuestionSchema>;

export const TicketQuestionsSchema = z
  .array(TicketQuestionSchema)
  .max(5)
  .default([]);

export const TicketsConfigSchema = z.object({
  transcriptChannelId: z.string().nullable().default(null),
  staffRoleIds: z.array(z.string()).default([]),
  autoCloseEnabled: z.boolean().default(true),
  autoCloseMinutes: z.number().int().min(5).max(525600).default(1440),
  feedbackEnabled: z.boolean().default(true),
  maxOpenPerUser: z.number().int().min(1).max(25).default(3),
  mentionStaffOnOpen: z.boolean().default(true),
});

export type TicketsConfig = z.infer<typeof TicketsConfigSchema>;

export const defaultTicketsConfig: TicketsConfig = TicketsConfigSchema.parse(
  {},
);

export function normalizeQuestions(value: unknown): TicketQuestion[] {
  const parsed = TicketQuestionsSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((question) => {
    const maxLength =
      question.style === "long"
        ? Math.min(question.maxLength ?? 1024, 1024)
        : Math.min(question.maxLength ?? 200, 200);
    return { ...question, maxLength };
  });
}

export function parseQuestionsInput(raw: string): TicketQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'Questions must be a JSON array of objects: [{"label":"...","style":"short"}].',
    );
  }
  const result = TicketQuestionsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "Invalid questions JSON. Each question needs a label of 1-45 characters and may set style, placeholder, required, and maxLength.",
    );
  }
  return normalizeQuestions(result.data);
}

export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const ids = raw
    .split(/[\s,]+/)
    .map((value) => value.replace(/[<@&!>]/g, ""))
    .filter((value) => isSnowflake(value));
  return [...new Set(ids)];
}

export async function getTicketsConfig(
  services: ModuleServices,
  guildId: string,
): Promise<TicketsConfig> {
  let stored: unknown;
  try {
    stored = await services.config.get(guildId, TicketsConfigKey);
  } catch (error) {
    services.observability?.logger?.warn?.("tickets config read failed", {
      guildId,
      error,
    });
    stored = undefined;
  }

  const parsed = TicketsConfigSchema.safeParse(stored ?? {});
  if (!parsed.success) {
    services.observability?.logger?.warn?.(
      "tickets config invalid, using defaults",
      { guildId, issues: parsed.error.issues },
    );
    return { ...defaultTicketsConfig };
  }

  const data = parsed.data;
  return {
    ...data,
    transcriptChannelId: isSnowflake(data.transcriptChannelId)
      ? data.transcriptChannelId
      : null,
    staffRoleIds: asIdList(data.staffRoleIds, { unique: true }),
  };
}

export function isTicketsModuleEnabled(
  services: ModuleServices,
  guildId: string,
): boolean {
  return services.modules.isEnabled(guildId, TicketsModuleName);
}
