"use client";

import { useState } from "react";
import { CheckCircle, Shield } from "lucide-react";
import { completeWebVerification } from "#/actions/verify-actions";
import { ActionError } from "#/components/action-error";
import { Button } from "#/components/ui/button";
import { useServerAction } from "#/lib/use-server-action";

export function WebVerifyPanel({ guildId }: { guildId: string }) {
  const [done, setDone] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  if (done) {
    return (
      <>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-success-soft text-success-fg">
            <CheckCircle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
              You&rsquo;re verified
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-fg-muted">
              Head back to Discord — the server should let you in now.
            </p>
          </div>
        </div>
      </>
    );
  }

  function verify() {
    run(async () => {
      const result = await completeWebVerification(guildId);
      if (!result.ok) {
        setError(result.error ?? "Verification failed. Try again in a moment.");
        return;
      }
      setDone(true);
    });
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
          <Shield className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
            Verify to continue
          </h1>
          <p className="mt-1 mb-4 text-[12px] leading-5 text-fg-muted">
            Click below to confirm it&rsquo;s you and unlock the rest of the
            server. This uses your signed-in Discord account — nothing else is
            needed.
          </p>
        </div>
      </div>
      <div className="mb-3" />
      <Button
        type="button"
        variant="primary"
        disabled={isPending}
        onClick={verify}
      >
        {isPending ? "Verifying…" : "Verify"}
      </Button>
      <ActionError error={error} className="mt-3" />
    </>
  );
}
