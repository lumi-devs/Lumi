"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "#/components/ui/button";

export function SendTestMessageButton({
  label,
  pendingLabel = "Saving & sending…",
  action,
}: {
  label: string;
  pendingLabel?: string;
  /** Persists any unsaved changes this preview depends on, then sends the
   * test message — the button is the only place that does both, so the
   * preview above it is never just a disconnected mockup. */
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setResult(null);
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setResult("ok");
      } else {
        setResult("error");
        setError(res.error ?? "Send failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={isPending}>
        <Send aria-hidden className="size-3.5" />
        {isPending ? pendingLabel : label}
      </Button>
      {result === "ok" ? (
        <p className="text-[12px] text-success">Sent — check the channel.</p>
      ) : null}
      {result === "error" ? <p className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
