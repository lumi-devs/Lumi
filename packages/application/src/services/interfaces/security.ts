export type { GuildBackupData } from "../security/backup-types.js";

export interface CaptchaVerificationResult {
  success: boolean;
  message?: string;
}

export interface AntiNukeActionContext {
  guildId: string;
  executorId: string;
  action: string;
}
