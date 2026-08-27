/**
 * `lumi/utils` - misc helpers: time formatting, error handling, Redis locks.
 */
export { BotConfig } from "#utilities/config.js";
export {
  relativeTimestamp,
  shortTimestamp,
  parseDuration,
  formatDuration,
} from "#utilities/time.js";
export { errorFrom, swallow, logError } from "#utilities/errors.js";
export {
  acquireRedisLock,
  verifyRedisLock,
  type RedisLock,
  type RedisLockOptions,
} from "#core/lib/redis-lock.js";
export type { GuildMessage } from "#lib/types.js";
