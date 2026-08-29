"use client";

import { FieldType, type ConfigField } from "@lumi/contracts";
import { Input, Select } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import type { DashboardRoleView, DashboardChannelView } from "#/lib/dashboard-data";

const DEFAULT_PICKABLE_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16]);

function channelOptionsFor(
  field: ConfigField,
  channels: DashboardChannelView[],
): DashboardChannelView[] {
  const allow = field.channelTypes;
  return channels.filter((c) =>
    allow && allow.length > 0
      ? allow.includes(c.type)
      : DEFAULT_PICKABLE_CHANNEL_TYPES.has(c.type),
  );
}

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
          id={field.key}
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
          id={field.key}
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
          id={field.key}
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
      const isSnowflake = field.type === FieldType.USER;
      return (
        <Input
          id={field.key}
          type="text"
          placeholder={placeholder}
          className={isSnowflake ? "font-mono text-[14px]" : undefined}
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
