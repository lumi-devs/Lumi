export interface FilterConfig {
  blockInvites: boolean;
  blockLinks: boolean;
  blockZalgo: boolean;
  zalgoThreshold: number;
  inviteAllowlist: string[];
  linkAllowlist: string[];
  timeoutAt: number;
  timeoutMinutes: number;
  escalateTimeouts: boolean;
  maxTimeoutMinutes: number;
}

export interface RuleViolation {
  rule: string;
  reason: string;
  matchedText?: string;
}
