"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./button-variants";
import { cn } from "#/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  itemLabel = "results",
  pageParam = "page",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemLabel?: string;
  pageParam?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  function hrefFor(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete(pageParam);
    else params.set(pageParam, String(target));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <p className="text-[12px] text-fg-muted">
        <span className="tabular text-fg">
          {first}–{last}
        </span>{" "}
        of <span className="tabular text-fg">{total}</span> {itemLabel}
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <PageStep
            href={hrefFor(page - 1)}
            disabled={page <= 1}
            label="Previous page"
          >
            <ChevronLeft aria-hidden />
            Previous
          </PageStep>
          <span className="font-display text-[12px] tracking-[0.02em] text-fg-muted">
            Page <span className="tabular text-fg">{page}</span> of{" "}
            <span className="tabular text-fg">{pageCount}</span>
          </span>
          <PageStep
            href={hrefFor(page + 1)}
            disabled={page >= pageCount}
            label="Next page"
          >
            Next
            <ChevronRight aria-hidden />
          </PageStep>
        </div>
      ) : null}
    </nav>
  );
}

function PageStep({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "secondary", size: "sm" });
  if (disabled) {
    return (
      <span aria-hidden className={cn(className, "opacity-45")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className} scroll={false}>
      {children}
    </Link>
  );
}
