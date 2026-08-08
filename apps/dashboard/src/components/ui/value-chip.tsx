import { cn } from "#/lib/utils";

// `text: null` renders as bare text, not a chip, so an absent setting can't be
// mistaken for one whose stored value is the word "none".
export function ValueChip({
  text,
  emphasis,
  className,
}: {
  text: string | null;
  emphasis?: boolean;
  className?: string;
}) {
  if (text === null) {
    return (
      <span className={cn("text-[12px] text-fg-subtle italic", className)}>
        Not set
      </span>
    );
  }
  return (
    <span
      title={text}
      className={cn(
        "max-w-full truncate rounded-full border bg-bg-subtle px-2 py-px font-mono text-[12px]",
        emphasis
          ? "border-border-strong text-fg"
          : "border-border text-fg-subtle",
        className,
      )}
    >
      {text}
    </span>
  );
}
