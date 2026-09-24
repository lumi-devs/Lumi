import { container } from "@sapphire/framework";
import {
  FieldType,
  fieldsFromSchema,
} from "#lib/module-system/config-schema.js";

export async function clearStaleConfigRefs(
  guildId: string,
  deletedId: string,
  kind: "channel" | "role",
): Promise<void> {
  const all = await container.db.config.getAllModuleConfigsForGuild(guildId);
  const singleType = kind === "channel" ? FieldType.Channel : FieldType.Role;
  const multiType =
    kind === "channel" ? FieldType.MultiChannel : FieldType.MultiRole;
  for (const [moduleName, values] of all) {
    try {
      const schema =
        await container.moduleStore.getConfigSchema(moduleName);
      if (!schema) continue;
      for (const field of fieldsFromSchema(schema)) {
        const current = values[field.key];
        if (field.type === singleType && current === deletedId) {
          await container.db.config.deleteModuleConfigKey(
            guildId,
            moduleName,
            field.key,
          );
        } else if (
          field.type === multiType &&
          Array.isArray(current) &&
          current.includes(deletedId)
        ) {
          const refs = current.filter(
            (v): v is string => typeof v === "string",
          );
          await container.db.config.setModuleConfig(
            guildId,
            moduleName,
            field.key,
            refs.filter((v) => v !== deletedId),
          );
        } else if (
          field.type === FieldType.ObjectArray &&
          Array.isArray(current) &&
          field.subfields?.some(
            (s) => s.type === singleType || s.type === multiType,
          )
        ) {
          const next = current.map((entry) => {
            if (typeof entry !== "object" || entry === null) return entry;
            const out = { ...(entry as Record<string, unknown>) };
            for (const sub of field.subfields ?? []) {
              if (sub.type === singleType && out[sub.key] === deletedId) {
                delete out[sub.key];
              } else if (
                sub.type === multiType &&
                Array.isArray(out[sub.key]) &&
                (out[sub.key] as unknown[]).includes(deletedId)
              ) {
                out[sub.key] = (out[sub.key] as unknown[]).filter(
                  (v) => v !== deletedId,
                );
              }
            }
            return out;
          });
          if (JSON.stringify(next) !== JSON.stringify(current)) {
            await container.db.config.setModuleConfig(
              guildId,
              moduleName,
              field.key,
              next,
            );
          }
        }
      }
    } catch {
      continue;
    }
  }
}
