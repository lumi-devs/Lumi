import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  WelcomePreviewPlayground,
  resolveWelcomePreview,
} from "#/components/guild/welcome-preview-playground";

const vars = {
  user: "@Alex",
  username: "alex",
  nickname: "Alex",
  server: "Acme Café",
  memberCount: 129,
};

describe("resolveWelcomePreview", () => {
  it("substitutes every known placeholder", () => {
    expect(
      resolveWelcomePreview(
        "Welcome {user} ({username}) to {server}! You are #{memberCount}.",
        vars,
      ),
    ).toBe("Welcome @Alex (alex) to Acme Café! You are #129.");
  });

  it("leaves unknown placeholders verbatim", () => {
    expect(
      resolveWelcomePreview("See {rules}, {user}!", vars),
    ).toBe("See {rules}, @Alex!");
  });
});

describe("WelcomePreviewPlayground", () => {
  it("renders both cards with member-count math applied", () => {
    const { container } = render(<WelcomePreviewPlayground />);
    expect(screen.getByText("Preview only — edits never save")).toBeInTheDocument();
    expect(screen.getByText("👋 Welcome")).toBeInTheDocument();
    expect(screen.getByText("Member left")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "Welcome @Alex to Acme Café! You are member 129.",
    );
    expect(container.textContent).toContain("alex has left Acme Café.");
  });

  it("edits to the welcome template update the preview instantly", () => {
    const { container } = render(<WelcomePreviewPlayground />);
    fireEvent.change(screen.getByLabelText("Welcome template"), {
      target: { value: "Hey {user}, glad you made it!" },
    });
    expect(container.textContent).toContain("Hey @Alex, glad you made it!");
    expect(container.textContent).not.toContain(
      "Welcome @Alex to Acme Café! You are member 129.",
    );
  });

  it("edits to the goodbye template update the preview instantly", () => {
    render(<WelcomePreviewPlayground />);
    fireEvent.change(screen.getByLabelText("Goodbye template"), {
      target: { value: "Farewell, {username}!" },
    });
    expect(screen.getByText("Farewell, alex!")).toBeInTheDocument();
  });

  it("changing the member count recomputes both cards", () => {
    const { container } = render(<WelcomePreviewPlayground />);
    fireEvent.change(screen.getByLabelText("Server members"), {
      target: { value: "10" },
    });
    expect(container.textContent).toContain(
      "Welcome @Alex to Acme Café! You are member 11.",
    );
    fireEvent.change(screen.getByLabelText("Goodbye template"), {
      target: { value: "{username} left. {memberCount} remain." },
    });
    expect(container.textContent).toContain("alex left. 9 remain.");
  });

  it("toggling cards off replaces them with a disabled note", () => {
    render(<WelcomePreviewPlayground />);
    fireEvent.click(screen.getByLabelText("Post welcome in channel"));
    expect(screen.queryByText("👋 Welcome")).not.toBeInTheDocument();
    expect(
      screen.getByText("Welcome card disabled — nothing will post on join."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Post goodbye in channel"));
    expect(screen.queryByText("Member left")).not.toBeInTheDocument();
    expect(
      screen.getByText("Goodbye card disabled — nothing will post on leave."),
    ).toBeInTheDocument();
  });

  it("toggling auto-role off drops the role line from the welcome card", () => {
    render(<WelcomePreviewPlayground />);
    expect(screen.getByText("Auto-roles: @Newcomer")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Assign auto-role"));
    expect(screen.queryByText("Auto-roles: @Newcomer")).not.toBeInTheDocument();
  });
});
