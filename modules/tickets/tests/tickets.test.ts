import { describe, expect, it } from "vitest";
import { escapeHtml, renderTranscript } from "../html.ts";
import { selectInactiveTickets } from "../inactivity.ts";
import {
  renderNamingTemplate,
  sanitizeThreadName,
  ticketThreadName,
} from "../naming.ts";
import {
  canCloseTicket,
  validateCloseReason,
  validateFeedback,
} from "../validation.ts";

describe("ticket HTML", () => {
  it("escapes every HTML metacharacter", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
    expect(escapeHtml(null)).toBe("");
  });

  it("renders a complete transcript with escaped user content", () => {
    const html = renderTranscript({
      ticketId: "ticket</title><script>alert(1)</script>",
      guildId: "guild-1",
      guildName: "<Guild & Co>",
      categoryName: "<Support>",
      userId: "user-1",
      subject: "<img src=x onerror=alert(1)>",
      status: "closed",
      priority: "high",
      claimedBy: "staff-1",
      closeReason: "<b>resolved</b>",
      closedBy: "staff-1",
      createdAt: new Date("2026-10-30T10:00:00Z"),
      closedAt: new Date("2026-10-30T11:00:00Z"),
      messages: [
        {
          authorId: "user-1",
          authorName: "<User>",
          content: "<script>steal()</script>",
          createdAt: new Date("2026-10-30T10:05:00Z"),
          attachments: [
            {
              name: "<file>.png",
              url: "https://example.test/a?x=1&y=2",
              size: 10,
              contentType: "image/png",
            },
          ],
        },
        {
          authorId: "staff-1",
          authorName: "Staff",
          content: "&lt;already escaped&gt;",
          createdAt: new Date("2026-10-30T10:06:00Z"),
        },
      ],
      notes: [
        {
          authorId: "staff-1",
          content: "<note & stuff>",
          createdAt: new Date("2026-10-30T10:07:00Z"),
        },
      ],
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;Guild &amp; Co&gt;");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
    expect(html).toContain("&lt;note &amp; stuff&gt;");
    expect(html).toContain("&lt;file&gt;.png");
    expect(html).toContain("https://example.test/a?x=1&amp;y=2");
    expect(html).toContain("&lt;already escaped&gt;");
    expect(html).not.toContain("<script>steal()</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<note & stuff>");
  });
});

describe("ticket thread naming", () => {
  it("renders every supported placeholder", () => {
    expect(
      renderNamingTemplate("{category}-{user}-{username}-{id}-{number}", {
        user: "Alice",
        username: "alice",
        userId: "123",
        category: "Billing",
        number: 7,
      }),
    ).toBe("Billing-Alice-alice-123-7");
  });

  it("sanitizes unsafe characters and limits length", () => {
    expect(sanitizeThreadName("  hello/world ###  ")).toBe("hello-world");
    expect(sanitizeThreadName("<script>")).toBe("script");
    expect(sanitizeThreadName("")).toBe("ticket");
    expect(
      ticketThreadName("ticket-{user}", {
        user: "a".repeat(200),
        username: "a",
        userId: "1",
        category: "x",
      }).length,
    ).toBe(100);
  });
});

describe("ticket close and feedback validation", () => {
  const openTicket = { status: "open", userId: "opener", feedback: null };
  const closedTicket = { status: "closed", userId: "opener", feedback: null };

  it("normalizes close reasons", () => {
    expect(validateCloseReason("   ")).toBe("No reason provided");
    expect(validateCloseReason("  fixed  ")).toBe("fixed");
    expect(validateCloseReason("x".repeat(1200)).length).toBe(1000);
  });

  it("allows only the opener or staff to close an open ticket", () => {
    expect(canCloseTicket(openTicket, "opener", false)).toEqual({ ok: true });
    expect(canCloseTicket(openTicket, "staff", true)).toEqual({ ok: true });
    expect(canCloseTicket(openTicket, "stranger", false).ok).toBe(false);
    expect(
      canCloseTicket({ ...openTicket, status: "closed" }, "opener", true).ok,
    ).toBe(false);
  });

  it("accepts one valid feedback per closed ticket from the opener", () => {
    expect(validateFeedback(closedTicket, "opener", 5, true)).toEqual({
      ok: true,
    });
    expect(validateFeedback(openTicket, "opener", 5, true).ok).toBe(false);
    expect(validateFeedback(closedTicket, "staff", 5, true).ok).toBe(false);
    expect(
      validateFeedback({ ...closedTicket, feedback: 4 }, "opener", 5, true).ok,
    ).toBe(false);
    expect(validateFeedback(closedTicket, "opener", 0, true).ok).toBe(false);
    expect(validateFeedback(closedTicket, "opener", 1.5, true).ok).toBe(false);
    expect(validateFeedback(closedTicket, "opener", 5, false).ok).toBe(false);
  });
});

describe("ticket inactivity selection", () => {
  const now = new Date("2026-10-30T12:00:00Z");

  it("selects open tickets at or beyond the inactivity threshold", () => {
    const tickets = [
      {
        id: "old",
        guildId: "g",
        status: "open",
        lastActivityAt: new Date("2026-10-30T10:00:00Z"),
      },
      {
        id: "edge",
        guildId: "g",
        status: "open",
        lastActivityAt: new Date("2026-10-30T11:00:00Z"),
      },
      {
        id: "new",
        guildId: "g",
        status: "open",
        lastActivityAt: new Date("2026-10-30T11:59:00Z"),
      },
      {
        id: "closed",
        guildId: "g",
        status: "closed",
        lastActivityAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        id: "bad-date",
        guildId: "g",
        status: "open",
        lastActivityAt: "not-a-date",
      },
    ];

    expect(
      selectInactiveTickets(tickets, now, 60 * 60_000).map(
        (ticket) => ticket.id,
      ),
    ).toEqual(["old", "edge"]);
  });

  it("returns nothing for a non-positive threshold", () => {
    const tickets = [
      {
        id: "old",
        guildId: "g",
        status: "open",
        lastActivityAt: new Date("2020-01-01T00:00:00Z"),
      },
    ];
    expect(selectInactiveTickets(tickets, now, 0)).toEqual([]);
    expect(selectInactiveTickets(tickets, now, Number.NaN)).toEqual([]);
  });
});
