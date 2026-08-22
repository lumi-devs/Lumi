import Link from "next/link";
import { cn } from "#/lib/utils";

export function SectionHead({
  title,
  href,
  linkLabel = "View all",
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="font-display text-[15px] font-semibold tracking-[0.07em] text-fg-muted uppercase">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          className="font-mono text-[14px] text-accent-fg hover:underline"
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}
