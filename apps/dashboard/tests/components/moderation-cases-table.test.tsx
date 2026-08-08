// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ActionResult } from "#/actions/guild-actions";
import type { ModerationCaseView } from "#/lib/dashboard-data";

const revokeCase = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/moderation-actions", () => ({ revokeCase }));

const { ModerationCasesTable } = await import(
  "#/components/guild/moderation-cases-table"
);

// jsdom ships the `<dialog>` element but not always its modal plumbing.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

function makeCase(overrides: Partial<ModerationCaseView> = {}): ModerationCaseView {
  return {
    id: 1,
    caseNumber: 12,
    userId: "200000000000000001",
    moderatorId: "200000000000000002",
    action: "ban",
    reason: "Raid",
    duration: null,
    expiresAt: null,
    active: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("ModerationCasesTable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers a revoke control only for cases that are still in effect", () => {
    render(
      <ModerationCasesTable
        guildId="101"
        cases={[makeCase(), makeCase({ id: 2, caseNumber: 13, active: false })]}
        memberNames={{}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Revoke case #12" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke case #13" }),
    ).not.toBeInTheDocument();
  });

  it("says the Discord action is untouched, then revokes the case on confirm", async () => {
    revokeCase.mockResolvedValue({ ok: true });
    render(
      <ModerationCasesTable guildId="101" cases={[makeCase()]} memberNames={{}} />,
    );

    screen.getByRole("button", { name: "Revoke case #12" }).click();
    expect(
      await screen.findByText(/does not undo the ban in Discord/),
    ).toBeInTheDocument();

    (await screen.findByRole("button", { name: "Revoke case" })).click();
    await waitFor(() => expect(revokeCase).toHaveBeenCalledWith("101", 12));
    expect(
      await screen.findByText(
        "Case #12 revoked. The action in Discord is unchanged.",
      ),
    ).toBeInTheDocument();
  });

  it("warns that revoking also cancels a scheduled automatic lift", async () => {
    render(
      <ModerationCasesTable
        guildId="101"
        cases={[
          makeCase({ action: "mute", expiresAt: "2026-08-09T10:00:00.000Z" }),
        ]}
        memberNames={{}}
      />,
    );

    screen.getByRole("button", { name: "Revoke case #12" }).click();
    expect(await screen.findByText(/Revoking it cancels that/)).toBeInTheDocument();
  });

  it("keeps the dialog open and shows why when the action fails", async () => {
    revokeCase.mockResolvedValue({
      ok: false,
      error: "Case #12 is already revoked",
    });
    render(
      <ModerationCasesTable guildId="101" cases={[makeCase()]} memberNames={{}} />,
    );

    screen.getByRole("button", { name: "Revoke case #12" }).click();
    (await screen.findByRole("button", { name: "Revoke case" })).click();

    expect(
      await screen.findByText("Case #12 is already revoked"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Revoke case #12?" }),
    ).toBeInTheDocument();
  });
});
