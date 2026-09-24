import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TempVcPreviewPlayground,
  resolvePreviewName,
} from "#/components/guild/tempvc-preview-playground";
import { VerificationPreviewPlayground } from "#/components/guild/verification-preview-playground";

describe("resolvePreviewName", () => {
  const who = { number: 3, username: "alex", displayName: "Alex" };

  it("substitutes every placeholder kind", () => {
    expect(resolvePreviewName("{}-{number}-{position}", who)).toBe("3-3-3");
    expect(resolvePreviewName("{username}'s room", who)).toBe("alex's room");
    expect(resolvePreviewName("{name}'s room", who)).toBe("Alex's room");
  });

  it("appends the number when no placeholder is present", () => {
    expect(resolvePreviewName("Lounge", who)).toBe("Lounge 3");
  });
});

describe("TempVcPreviewPlayground", () => {
  it("edits to the template update the voice row and panel instantly", () => {
    render(<TempVcPreviewPlayground defaultTemplate="{username}'s lounge" />);
    expect(screen.getByText("Preview only — edits never save")).toBeInTheDocument();
    expect(screen.getAllByText("alex's lounge").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Channel name template"), {
      target: { value: "{name} #{number}" },
    });
    expect(screen.queryAllByText("alex's lounge")).toHaveLength(0);
    expect(screen.getAllByText("Alex #3").length).toBeGreaterThan(0);
  });
});

describe("VerificationPreviewPlayground", () => {
  it("edits to the welcome text update the panel instantly", () => {
    render(<VerificationPreviewPlayground />);
    expect(screen.getByText("✅ Verify")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Welcome text"), {
      target: { value: "Brand new welcome copy here" },
    });
    expect(
      screen.getAllByText("Brand new welcome copy here").length,
    ).toBeGreaterThan(1);
  });
});
