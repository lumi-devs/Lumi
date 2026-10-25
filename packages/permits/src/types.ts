export type PermitKind = "CUSTOM";
export type Polarity = "GRANT" | "DENY";
export type PermitTargetType = "USER" | "ROLE" | "CHANNEL";

export interface Permit {
  id: number;
  guildId: string;
  name: string;
  node: string;
  polarity: Polarity;
  position: number;
  builtin: boolean;
  expiresAt: Date | null;
  schedule: unknown;
  timezone: string | null;
  conditions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermitAssignment {
  id: number;
  permitId: number;
  guildId: string;
  targetType: PermitTargetType;
  targetId: string;
  grantedAt: Date;
  grantedBy: string;
  expiresAt: Date | null;
}

export interface PermitConditions {
  channelIds?: string[];
  roleIds?: string[];
  notRoleIds?: string[];
  timeWindow?: {
    start: string;
    end: string;
    days?: number[];
  };
  timezone?: string;
}

export interface EvaluatePermitOptions {
  guildId: string;
  userId: string;
  roleIds?: string[];
  channelId?: string;
  guildOwnerId?: string | null;
  permitNode: string;
  at?: Date;
}

export interface PermitTierExplanation {
  tier: string;
  verdict: "allow" | "deny" | "pass";
  detail?: string;
}

export interface EvaluatedPermit {
  rows: PermitTierExplanation[];
  allowed: boolean;
}

export interface PermitChainResult {
  tiers: Array<{
    custom: { grant: string[]; deny: string[] };
  }>;
  isQuarantined: boolean;
}