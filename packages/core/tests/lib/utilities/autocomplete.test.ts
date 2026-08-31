import { describe, it, expect, vi } from "vitest";
import {
  AutocompleteChoiceLimit,
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";

describe("filterAutocompleteChoices", () => {
  it("returns all values when the query is empty", () => {
    expect(filterAutocompleteChoices(["a", "b", "c"], "")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters case-insensitively by substring", () => {
    expect(
      filterAutocompleteChoices(["admin.*", "admin.config", "mod.*"], "ADMIN"),
    ).toEqual(["admin.*", "admin.config"]);
  });

  it("caps results at 25 choices", () => {
    const values = Array.from({ length: 40 }, (_, i) => `value-${i}`);
    const result = filterAutocompleteChoices(values, "");
    expect(result).toHaveLength(AutocompleteChoiceLimit);
    expect(result).toEqual(values.slice(0, AutocompleteChoiceLimit));
  });

  it("respects a custom limit", () => {
    const values = ["a", "b", "c", "d"];
    expect(filterAutocompleteChoices(values, "", 2)).toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterAutocompleteChoices(["a", "b"], "zzz")).toEqual([]);
  });
});

describe("respondWithChoices", () => {
  it("maps values to name/value pairs", async () => {
    const respond = vi.fn();
    await respondWithChoices({ respond } as any, ["foo", "bar"]);
    expect(respond).toHaveBeenCalledWith([
      { name: "foo", value: "foo" },
      { name: "bar", value: "bar" },
    ]);
  });

  it("truncates choice text to 100 characters", async () => {
    const respond = vi.fn();
    const long = "x".repeat(150);
    await respondWithChoices({ respond } as any, [long]);
    const choices = respond.mock.calls[0]![0];
    expect(choices[0].name).toHaveLength(100);
    expect(choices[0].value).toHaveLength(100);
  });
});
