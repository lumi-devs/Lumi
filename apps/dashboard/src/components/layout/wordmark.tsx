import { cn } from "#/lib/utils";

export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className="size-[18px] text-accent"
        aria-hidden
        fill="none"
      >
        <path
          d="M12 2 13.9 8.1a4 4 0 0 0 2.6 2.6L22 12l-5.5 1.3a4 4 0 0 0-2.6 2.6L12 22l-1.9-6.1a4 4 0 0 0-2.6-2.6L2 12l5.5-1.3a4 4 0 0 0 2.6-2.6L12 2Z"
          fill="currentColor"
        />
      </svg>
      {showText && (
        <span className="font-display text-[17px] font-semibold tracking-[0.06em] text-fg uppercase">
          Lumi
        </span>
      )}
    </span>
  );
}
