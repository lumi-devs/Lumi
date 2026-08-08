import { cn } from "#/lib/utils";

export function ReadoutList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn("divide-y divide-border", className)} {...props} />;
}

export function Readout({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:gap-4",
        className,
      )}
    >
      <dt className="font-display w-40 shrink-0 pt-0.5 text-[11px] tracking-[0.09em] text-fg-subtle uppercase">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[13px] leading-5 text-fg">{children}</dd>
    </div>
  );
}
