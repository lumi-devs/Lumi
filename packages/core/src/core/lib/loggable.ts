import { container } from "@sapphire/framework";
import { tryGetService } from "#core/module-system/Service.js";

export interface AuditEntry {
  action: string;
  targetId: string;
  actorId: string;
  guildId: string;
  moduleName?: string;
  reason?: string;
  color?: number;
  caseNumber?: number;
  extra?: Record<string, unknown>;
}

function isAuditEntry(val: unknown): val is AuditEntry {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof (val as AuditEntry).action === "string" &&
    typeof (val as AuditEntry).targetId === "string" &&
    typeof (val as AuditEntry).actorId === "string" &&
    typeof (val as AuditEntry).guildId === "string"
  );
}

export function loggable(
  _target: object,
  _key: string,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const original = descriptor.value as (...args: unknown[]) => unknown;

  descriptor.value = async function (this: unknown, ...args: unknown[]) {
    const result = await original.apply(this, args);

    if (isAuditEntry(result)) {
      const logService = tryGetService("guild-log");

      logService
        ?.dispatch(result)
        .catch((err: unknown) =>
          container.logger.error(
            "[loggable] Failed to dispatch audit entry:",
            err,
          ),
        );
    }

    return result;
  };

  return descriptor;
}
