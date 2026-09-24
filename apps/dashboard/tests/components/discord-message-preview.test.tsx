import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  DiscordMessagePreview,
  MarkdownLite,
} from "#/components/guild/discord-message-preview";

describe("MarkdownLite", () => {
  it("renders bold, italic, code and links", () => {
    render(<MarkdownLite text="Hello **bold** and *italic* with `code` and [docs](https://example.com/x)" />);
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/x");
  });

  it("renders channel and mention pills", () => {
    render(<MarkdownLite text="See <#general> and <@alex> plus @everyone" />);
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.getByText("@alex")).toBeInTheDocument();
  });

  it("does not render javascript: URIs as clickable links", () => {
    const { container } = render(<MarkdownLite text="[click me](javascript:alert(1))" />);
    expect(screen.queryByRole("link", { name: "click me" })).not.toBeInTheDocument();
    expect(container.textContent).toContain("[click me](javascript:alert(1))");
  });

  it("does not render a bare non-http scheme as a clickable link", () => {
    render(<MarkdownLite text="visit javascript:alert(1) now" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("still renders safe http/https links as clickable", () => {
    render(<MarkdownLite text="See https://example.com/path for details" />);
    const link = screen.getByRole("link", { name: "https://example.com/path" });
    expect(link).toHaveAttribute("href", "https://example.com/path");
  });
});

describe("DiscordMessagePreview", () => {
  it("renders channel chrome, author with BOT tag and timestamp", () => {
    render(
      <DiscordMessagePreview
        channelName="mod-log"
        channelTopic="Moderator actions"
        body="Hello world"
        timestamp="Today at 4:20 PM"
      />,
    );
    expect(screen.getByText("mod-log")).toBeInTheDocument();
    expect(screen.getByText("Moderator actions")).toBeInTheDocument();
    expect(screen.getByText("Lumi")).toBeInTheDocument();
    expect(screen.getByText("BOT")).toBeInTheDocument();
    expect(screen.getByText("Today at 4:20 PM")).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders embeds with accent bar, fields and footer", () => {
    render(
      <DiscordMessagePreview
        channelName="general"
        embed={{
          accentColor: "#12b886",
          title: "Case #1042",
          body: ["**Action:** Ban"],
          fields: [{ name: "Reason", value: "Spam", inline: true }],
          footer: "Appeal with /appeal",
        }}
      />,
    );
    expect(screen.getByText("Case #1042")).toBeInTheDocument();
    expect(screen.getByText("Ban")).toBeInTheDocument();
    expect(screen.getByText("Reason")).toBeInTheDocument();
    expect(screen.getByText("Spam")).toBeInTheDocument();
    expect(screen.getByText("Appeal with /appeal")).toBeInTheDocument();
  });

  it("renders button rows including disabled and active states", () => {
    render(
      <DiscordMessagePreview
        channelName="verify-here"
        selectPlaceholder="Manage Channel…"
        buttons={[
          { label: "✅ Verify", style: "success" },
          { label: "Next", style: "secondary", disabled: true },
        ]}
      />,
    );
    expect(screen.getByText("Manage Channel…")).toBeInTheDocument();
    expect(screen.getByText("✅ Verify")).toBeInTheDocument();
    const disabled = screen.getByText("Next");
    expect(disabled).toHaveAttribute("aria-disabled", "true");
  });

  it("renders voice channel rows with members", () => {
    render(
      <DiscordMessagePreview
        channelName="voice-setup"
        voiceRows={[
          { name: "alex's lounge", memberCount: 2, members: ["Alex", "Sam"] },
        ]}
      />,
    );
    expect(screen.getByText("alex's lounge")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });
});
