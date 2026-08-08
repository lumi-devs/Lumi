"use client";

import { useState } from "react";
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
        <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
          You&rsquo;re verified
        </h1>
        <p className="mt-1 text-[12px] leading-5 text-fg-muted">
          Head back to Discord — the server should let you in now.
        </p>
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
      <h1 className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
        Verify to continue
      </h1>
      <p className="mt-1 mb-4 text-[12px] leading-5 text-fg-muted">
        Click below to confirm it&rsquo;s you and unlock the rest of the
        server. This uses your signed-in Discord account — nothing else is
        needed.
      </p>
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
