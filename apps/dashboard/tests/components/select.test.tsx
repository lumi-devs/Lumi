import { describe, it, expect, vi } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "#/components/ui/select";

const options = [
  { value: "", label: "None" },
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("Select", () => {
  it("shows the selected label and keeps options hidden until opened", () => {
    render(<Select value="a" onValueChange={() => {}} options={options} aria-label="Pick" />);

    expect(screen.getByRole("combobox", { name: "Pick" })).toHaveTextContent("Alpha");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Beta" })).not.toBeInTheDocument();
  });

  it("opens on click and chooses an option", () => {
    const onValueChange = vi.fn();
    render(<Select value="a" onValueChange={onValueChange} options={options} aria-label="Pick" />);

    fireEvent.click(screen.getByRole("combobox", { name: "Pick" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toHaveAttribute("aria-selected", "false");

    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation with aria-activedescendant", () => {
    const onValueChange = vi.fn();
    render(<Select value="a" onValueChange={onValueChange} options={options} aria-label="Pick" />);

    const trigger = screen.getByRole("combobox", { name: "Pick" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("closes on Escape without choosing", () => {
    const onValueChange = vi.fn();
    render(<Select value="a" onValueChange={onValueChange} options={options} aria-label="Pick" />);

    fireEvent.click(screen.getByRole("combobox", { name: "Pick" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Pick" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("filters long lists through the search box", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      value: `v${i}`,
      label: `Item ${i}`,
    }));
    render(<Select value="" onValueChange={() => {}} options={many} aria-label="Pick" />);

    fireEvent.click(screen.getByRole("combobox", { name: "Pick" }));
    fireEvent.change(screen.getByLabelText("Search options"), {
      target: { value: "Item 1" },
    });
    expect(screen.getByRole("option", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Item 2" })).not.toBeInTheDocument();
  });

  it("marks the trigger expanded state for assistive tech", () => {
    render(<Select value="" onValueChange={() => {}} options={options} aria-label="Pick" />);

    const trigger = screen.getByRole("combobox", { name: "Pick" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
