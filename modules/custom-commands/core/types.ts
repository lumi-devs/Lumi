export const ModuleName = "custom-commands";
export const ConfigKey = "customCommands";

export const TriggerTypes = [
  "command",
  "prefix",
  "exact",
  "startsWith",
  "contains",
  "regex",
  "reactionAdd",
  "reactionRemove",
  "button",
  "select",
  "modal",
  "interval",
  "cron",
] as const;

export type TriggerType = (typeof TriggerTypes)[number];

export const MessageTriggerTypes: readonly TriggerType[] = [
  "command",
  "prefix",
  "exact",
  "startsWith",
  "contains",
  "regex",
];

export const InteractionTriggerTypes: readonly TriggerType[] = [
  "button",
  "select",
  "modal",
];

export const ScheduleTriggerTypes: readonly TriggerType[] = [
  "interval",
  "cron",
];

export const AccentKeys = [
  "success",
  "warning",
  "error",
  "gold",
  "purple",
  "cyan",
] as const;

export type AccentKey = (typeof AccentKeys)[number];

export interface CardResponseSpec {
  title?: string;
  body: string | string[];
  accent?: AccentKey;
}

export type ResponseSpec = string | CardResponseSpec;

export const Limits = {
  commandsPerGuild: 200,
  groupsPerGuild: 50,
  responsesPerCommand: 20,
  renderedOutputBytes: 10 * 1024,
  kvOpsPerRun: 100,
  apiCallsPerRun: 10,
  responseTimeoutMs: 5_000,
  kvKeysPerUser: 100,
  keyLength: 128,
  valueBytes: 8 * 1024,
  templateLength: 20_000,
  importBytes: 100 * 1024,
  importCommands: 100,
  importGroups: 50,
  cooldownMaxSeconds: 86_400,
  nameMaxLength: 64,
  descriptionMaxLength: 200,
  triggerMaxLength: 200,
  regexMaxLength: 200,
  kvTtlMaxSeconds: 365 * 24 * 60 * 60,
  rangeIterations: 1_000,
  templateNodes: 5_000,
  evalSteps: 50_000,
  maxDepth: 32,
} as const;

export interface CustomCommandGroupRow {
  id: string;
  guildId: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomCommandScheduleRow {
  id: string;
  commandId: string;
  cron: string | null;
  intervalSeconds: number | null;
  timezone: string | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface CustomCommandRow {
  id: string;
  guildId: string;
  groupId: string | null;
  group?: CustomCommandGroupRow | null;
  name: string;
  description: string | null;
  triggerType: string;
  trigger: string;
  responses: unknown;
  enabled: boolean;
  cooldownSeconds: number;
  permissionNodes: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  schedule?: CustomCommandScheduleRow | null;
}

export interface CustomCommandKvRow {
  id: string;
  guildId: string;
  userId: string;
  key: string;
  value: unknown;
  expiresAt: Date | null;
  updatedAt: Date;
}

export interface CommandExport {
  version: 1;
  exportedAt: string;
  groups: Array<{
    name: string;
    description?: string;
    position?: number;
  }>;
  commands: Array<{
    name: string;
    description?: string;
    triggerType: TriggerType;
    trigger: string;
    responses: ResponseSpec[];
    enabled?: boolean;
    cooldownSeconds?: number;
    permissionNodes?: string[];
    group?: string;
    schedule?: {
      cron?: string;
      intervalSeconds?: number;
      timezone?: string;
    };
  }>;
}

export interface TriggerSnapshot {
  type: TriggerType;
  value: string;
}

export interface ExecutionReplyTarget {
  kind: "interaction" | "message" | "channel";
  interaction?: unknown;
  message?: unknown;
  channel?: unknown;
}

export interface ExecutionInput {
  guildId: string;
  actorId: string;
  args: string[];
  trigger: TriggerSnapshot;
  modalFields?: Record<string, string>;
  selectValues?: string[];
  reply: ExecutionReplyTarget;
}

export interface KvAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<unknown>;
  incr(key: string, by?: number): Promise<number>;
  del(key: string): Promise<boolean>;
}
