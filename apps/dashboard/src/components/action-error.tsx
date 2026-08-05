import { Alert } from "#/components/ui/alert";
import { cn } from "#/lib/utils";

/** Shared error surface for `useServerAction`/`useOptimisticAction` consumers. */
export function ActionError({
  error,
  className,
}: {
  error: string | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <Alert variant="danger" className={cn(className)}>
      {error}
    </Alert>
  );
}
