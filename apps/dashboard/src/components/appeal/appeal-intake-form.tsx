"use client";

import { useState } from "react";
import { CheckCircle, Scale } from "lucide-react";
import { submitAppeal } from "#/actions/public-appeal-actions";
import { Alert } from "#/components/ui/alert";
import { ActionError } from "#/components/action-error";
import { Button } from "#/components/ui/button";
import { Field, Textarea } from "#/components/ui/input";
import type { AppealCaseSummary } from "#/lib/dashboard-data";
import { caseActionLabel, formatCaseDate } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

const MIN_LENGTH = 20;
const MAX_LENGTH = 2000;

export function AppealIntakeForm({
  guildId,
  caseId,
  token,
  caseSummary,
}: {
  guildId: string;
  caseId: number;
  token: string;
  caseSummary: AppealCaseSummary;
}) {
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  if (submitted) {
    return (
      <>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-success-soft text-success-fg">
            <CheckCircle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
              Appeal submitted
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-fg-muted">
              The server's staff can now review it. There&rsquo;s nothing else to
              do here — you don&rsquo;t need to submit again.
            </p>
          </div>
        </div>
      </>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError(`Say a bit more — at least ${MIN_LENGTH} characters.`);
      return;
    }
    run(async () => {
      const result = await submitAppeal(guildId, caseId, token, trimmed);
      if (!result.ok) {
        setError(result.error ?? "Submitting the appeal failed. Try again in a moment.");
        return;
      }
      setSubmitted(true);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
          <Scale className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
            Appeal this {caseActionLabel(caseSummary.action).toLowerCase()}
          </h1>
        </div>
      </div>
      <div className="mt-2 mb-4 rounded-control border border-border bg-bg-subtle p-3 text-[12px] leading-5 text-fg-muted">
        <p>
          Case #{caseSummary.caseNumber} · {formatCaseDate(caseSummary.createdAt)}
        </p>
        {caseSummary.reason ? (
          <p className="mt-1 text-fg">
            <span className="text-fg-subtle">Reason given: </span>
            {caseSummary.reason}
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label="Why should this be reconsidered?"
          htmlFor="appeal-message"
          className="gap-1"
          hint={`${message.trim().length}/${MAX_LENGTH} characters`}
        >
          <Textarea
            id="appeal-message"
            value={message}
            maxLength={MAX_LENGTH}
            rows={6}
            placeholder="Explain what happened and why you think this decision should be reversed."
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <Alert variant="info">
          This is sent directly to the server's staff. Submitting again after
          this won&rsquo;t be possible for the same case, so make it count.
        </Alert>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit appeal"}
        </Button>
        <ActionError error={error} />
      </form>
    </>
  );
}
