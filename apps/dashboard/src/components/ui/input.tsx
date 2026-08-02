import { cn } from "#/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-white placeholder:text-white/30",
        "outline-none transition-colors focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-[#0d0f18] px-3 text-sm text-white",
        "outline-none transition-colors focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-semibold text-white", className)}
      {...props}
    />
  );
}
