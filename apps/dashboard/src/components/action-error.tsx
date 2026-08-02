import { cn } from "#/lib/utils";

/** Shared error line for `useServerAction`/`useOptimisticAction` consumers. */
export function ActionError({
  error,
  className,
}: {
  error: string | null;
  className?: string;
}) {
  if (!error) return null;
  return <p className={cn("text-xs text-danger", className)}>{error}</p>;
}
