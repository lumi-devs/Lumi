import { cn } from "#/lib/utils";

/**
 * Module identity mark.
 *
 * Icon policy for this app, applied consistently:
 *   - Application chrome (navigation, buttons, states, status) uses
 *     `lucide-react`. Emoji are never used as an icon set there.
 *   - A *module's* emoji is author-supplied identity metadata that arrives
 *     over RPC (`DashboardModuleView.emoji`), the same class of thing as a
 *     guild icon. It's kept, but rendered inside a fixed bordered tile so it
 *     reads as an avatar rather than as a stand-in for a real icon — and so a
 *     4-wide emoji and a 1-wide emoji still produce identical row heights.
 */
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
        "inline-flex shrink-0 items-center justify-center rounded border border-border bg-bg-subtle leading-none select-none",
        size === "sm" ? "size-5 text-[11px]" : "size-7 text-[13px]",
        className,
      )}
    >
      {emoji}
    </span>
  );
}
