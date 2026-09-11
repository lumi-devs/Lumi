import type { ReactNode } from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "#/components/ui/empty-state";

export function LoadFailure({
  what,
  error,
  title,
  description,
}: {
  what: string;
  error?: string | null;
  title?: string;
  description?: ReactNode;
}) {
  return (
    <EmptyState
      compact
      icon={PlugZap}
      title={title ?? `${what} couldn't be loaded`}
      description={
        description ??
        "Check that the bot is online and connected to the message broker, then reload this page."
      }
      footnote={error ?? undefined}
    />
  );
}
