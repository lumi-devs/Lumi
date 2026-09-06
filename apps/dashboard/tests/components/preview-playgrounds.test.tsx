// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TempVcPreviewPlayground,
  resolvePreviewName,
} from "#/components/guild/tempvc-preview-playground";
import { AfkPreviewPlayground } from "#/components/guild/afk-preview-playground";
import { VerificationPreviewPlayground } from "#/components/guild/verification-preview-playground";
import { ModerationPreviewCard } from "#/components/guild/moderation-preview-card";
import { ReactionRolesPreviewPlayground } from "#/components/guild/reactionroles-preview-playground";

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

describe("AfkPreviewPlayground", () => {
  it("edits to the message update the AFK notice instantly", () => {
    render(<AfkPreviewPlayground />);
    expect(screen.getByText("💤 Alex is AFK")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("AFK message"), {
      target: { value: "in a meeting" },
    });
    expect(screen.getByText("in a meeting")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: "Sam" },
    });
    expect(screen.getByText("💤 Sam is AFK")).toBeInTheDocument();
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

describe("ReactionRolesPreviewPlayground", () => {
  it("edits to the title and options update the menu card instantly", () => {
    render(<ReactionRolesPreviewPlayground />);
    expect(screen.getByText("Preview only — edits never save")).toBeInTheDocument();
    expect(screen.getByText("🎭 Game night roles")).toBeInTheDocument();
    expect(screen.getAllByText("Valorant").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Movie club" },
    });
    expect(screen.getByText("🎭 Movie club")).toBeInTheDocument();
    expect(screen.queryByText("🎭 Game night roles")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Option 1 label"), {
      target: { value: "Chess" },
    });
    expect(screen.getAllByText("Chess").length).toBeGreaterThan(0);
  });

  it("switching modes swaps buttons for the dropdown and reaction hints", () => {
    render(<ReactionRolesPreviewPlayground />);
    expect(screen.getAllByText("Valorant").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Mode"), {
      target: { value: "select" },
    });
    expect(screen.getByText("Choose your roles…")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mode"), {
      target: { value: "reactions" },
    });
    expect(
      screen.getByText(
        "React to this message to claim a role. Remove your reaction to give it back.",
      ),
    ).toBeInTheDocument();
  });
});
describe("ModerationPreviewCard", () => {
  it("edits to the reason update the sample case card instantly", () => {
    render(<ModerationPreviewCard />);
    expect(screen.getByText("Case #1042")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Raiding the welcome channel" },
    });
    expect(
      screen.getAllByText("Raiding the welcome channel").length,
    ).toBeGreaterThan(0);
  });
});
