// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveBar } from "#/components/save-bar";

describe("SaveBar", () => {
  it("renders nothing when not dirty", () => {
    const { container } = render(
      <SaveBar dirty={false} saving={false} onSave={vi.fn()} onReset={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unsaved-changes bar when dirty", () => {
    render(<SaveBar dirty={true} saving={false} onSave={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("calls onSave when the Save button is clicked", () => {
    const onSave = vi.fn();
    render(<SaveBar dirty={true} saving={false} onSave={onSave} onReset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onReset when the Reset button is clicked", () => {
    const onReset = vi.fn();
    render(<SaveBar dirty={true} saving={false} onSave={vi.fn()} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("disables both buttons while saving", () => {
    render(<SaveBar dirty={true} saving={true} onSave={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("shows the error message when provided", () => {
    render(
      <SaveBar dirty={true} saving={false} error="Save failed" onSave={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("triggers onSave on Cmd+S / Ctrl+S while dirty", () => {
    const onSave = vi.fn();
    render(<SaveBar dirty={true} saving={false} onSave={onSave} onReset={vi.fn()} />);

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(onSave).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("does not wire up the Cmd+S shortcut when not dirty", () => {
    const onSave = vi.fn();
    render(<SaveBar dirty={false} saving={false} onSave={onSave} onReset={vi.fn()} />);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });
});
