import { cn } from "#/lib/utils";

// Icon policy: application chrome uses `lucide-react` and never emoji. A
// module's emoji is author-supplied identity metadata arriving over RPC, so it
// is kept — but boxed in a fixed tile, so a 4-wide and a 1-wide emoji still
// produce identical row heights.
export function Glyph({
  emoji,
  size = "md",
  className,
}: {
  emoji: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control border border-border bg-bg-subtle leading-none select-none",
        size === "sm" ? "size-5 text-[11px]" : "size-7 text-[13px]",
        className,
      )}
    >
      {emoji}
    </span>
  );
}
