"use client";

import { FieldType, type ConfigField } from "@lumi/contracts";
import { Input, Select } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import type { DashboardRoleView, DashboardChannelView } from "#/lib/dashboard-data";

/** Channel types shown when a CHANNEL field doesn't declare its own `channelTypes` restriction. */
const DEFAULT_PICKABLE_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16]);

function channelOptionsFor(
  field: ConfigField,
  channels: DashboardChannelView[],
): DashboardChannelView[] {
  const allow = field.channelTypes as number[] | undefined;
  return channels.filter((c) =>
    allow && allow.length > 0
      ? allow.includes(c.type)
      : DEFAULT_PICKABLE_CHANNEL_TYPES.has(c.type),
  );
}

/** Renders the right control for a `ConfigField`, mirroring the old `fieldInput()` switch in views.ts. */
export function ConfigFieldInput({
  field,
  value,
  onChange,
  roles = [],
  channels = [],
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
}) {
  switch (field.type) {
    case FieldType.BOOLEAN:
      return (
        <Switch
          checked={Boolean(value)}
          onChange={onChange}
          aria-label={field.label}
        />
      );

    case FieldType.ENUM:
      return (
        <Select
          id={field.key}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      );

    case FieldType.NUMBER:
      return (
        <Input
          id={field.key}
          type="number"
          className="tabular"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );

    case FieldType.ROLE: {
      const shown = typeof value === "string" ? value : "";
      return (
        <Select
          aria-label={field.label}
          value={shown}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">None</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      );
    }

    case FieldType.CHANNEL: {
      const shown = typeof value === "string" ? value : "";
      const options = channelOptionsFor(field, channels);
      return (
        <Select
          aria-label={field.label}
          value={shown}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">None</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </Select>
      );
    }

    default: {
      const placeholder =
        field.type === FieldType.USER
          ? "User ID"
          : field.list
            ? "comma, separated, values"
            : "";
      const shown = Array.isArray(value)
        ? value.join(", ")
        : ((value as string | undefined) ?? "");
      // Snowflake IDs are long digit strings — mono keeps them scannable and
      // stops them from looking like prose in the middle of a settings list.
      const isSnowflake = field.type === FieldType.USER;
      return (
        <Input
          id={field.key}
          type="text"
          placeholder={placeholder}
          className={isSnowflake ? "font-mono text-[12px]" : undefined}
          value={shown}
          onChange={(e) => {
            if (field.list) {
              onChange(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
            } else {
              onChange(e.target.value);
            }
          }}
        />
      );
    }
  }
}
