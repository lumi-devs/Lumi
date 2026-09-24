import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import { FieldType, type ConfigField } from "@lumi/contracts";

const setTempVcGenerator = vi.fn();
const deleteTempVcGenerator = vi.fn();
vi.mock("#/actions/tempvc-actions", () => ({
  setTempVcGenerator,
  deleteTempVcGenerator,
}));

const { TempVcGenerators } = await import(
  "#/components/guild/tempvc-generators"
);

const channels = [{ id: "111", name: "Lobby", type: 2 }];

const templateField: ConfigField = {
  key: "default_name_template",
  label: "Default Channel Name Pattern",
  type: FieldType.String,
  description:
    "Used to pre-fill new generators. Supports {username}, {name}, {number}, {position}.",
  default: "{username}'s Channel",
};

function renderGenerators(field?: ConfigField) {
  return render(
    <TempVcGenerators
      guildId="guild-1"
      generators={[]}
      channels={channels}
      templateField={field}
    />,
  );
}

describe("TempVcGenerators (schema-sourced name-pattern docs)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the placeholder and default from the schema field", () => {
    renderGenerators(templateField);
    const input = screen.getByLabelText("Name pattern", { selector: "input" });
    expect(input).toHaveAttribute("placeholder", "{username}'s Channel");
    expect(input).toHaveValue("{username}'s Channel");
    expect(
      screen.getByRole("button", { name: "Name pattern placeholders" }),
    ).toBeInTheDocument();
  });

  it("hides the placeholder docs button when the schema field is missing", () => {
    renderGenerators(undefined);
    expect(
      screen.queryByRole("button", { name: "Name pattern placeholders" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name pattern", { selector: "input" })).toHaveValue("");
  });
});
