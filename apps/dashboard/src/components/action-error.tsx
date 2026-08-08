import { Alert } from "#/components/ui/alert";
import { cn } from "#/lib/utils";

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
