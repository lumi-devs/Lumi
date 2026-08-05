"use client";

import { useEffect } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Button } from "#/components/ui/button";

/**
 * Route error boundary. Without one, an RPC failure fell through to Next's
 * default error screen — which in production is an unstyled "Application
 * error" string and gives an operator nothing to act on.
 *
 * The digest is surfaced deliberately: this is a self-hosted admin panel, and
 * the person seeing this is the person reading the worker logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={ServerCrash}
          title="Something went wrong"
          description="The dashboard couldn't reach the bot worker, or the worker returned an error. Check that apps/worker is running and connected to RabbitMQ."
          action={
            <Button variant="secondary" onClick={reset}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          }
          footnote={error.digest ?? error.message}
        />
      </Card>
    </main>
  );
}
