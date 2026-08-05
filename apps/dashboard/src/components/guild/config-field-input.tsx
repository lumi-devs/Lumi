"use client";

import { FieldType, type ConfigField } from "@lumi/contracts";
import { Input, Select } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";

/** Renders the right control for a `ConfigField`, mirroring the old `fieldInput()` switch in views.ts. */
export function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
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

    default: {
      const placeholder =
        field.type === FieldType.CHANNEL
          ? "Channel ID"
          : field.type === FieldType.ROLE
            ? "Role ID"
            : field.type === FieldType.USER
              ? "User ID"
              : field.list
                ? "comma, separated, values"
                : "";
      const shown = Array.isArray(value)
        ? value.join(", ")
        : ((value as string | undefined) ?? "");
      // Snowflake IDs are long digit strings — mono keeps them scannable and
      // stops them from looking like prose in the middle of a settings list.
      const isSnowflake =
        field.type === FieldType.CHANNEL ||
        field.type === FieldType.ROLE ||
        field.type === FieldType.USER;
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
