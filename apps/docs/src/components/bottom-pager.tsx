"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NAVIGATION } from "@/components/sidebar";

export function BottomPager() {
  const pathname = usePathname();

  // Flatten all doc links
  const allLinks = NAVIGATION.flatMap((g) => g.links);
  const currentIndex = allLinks.findIndex((l) => l.href === pathname);

  const prevLink = currentIndex > 0 ? allLinks[currentIndex - 1] : null;
  const nextLink = currentIndex >= 0 && currentIndex < allLinks.length - 1 ? allLinks[currentIndex + 1] : null;

  if (!prevLink && !nextLink) return null;

  return (
    <div className="mt-16 pt-8 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
      {prevLink ? (
        <Link
          href={prevLink.href}
          className="group flex flex-col p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
        >
          <div className="flex items-center gap-1 text-xs text-[var(--fg-muted)] group-hover:text-[var(--accent)] font-medium mb-1">
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </div>
          <span className="text-sm font-bold text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">
            {prevLink.title}
          </span>
        </Link>
      ) : <div />}

      {nextLink ? (
        <Link
          href={nextLink.href}
          className="group flex flex-col items-end text-right p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
        >
          <div className="flex items-center gap-1 text-xs text-[var(--fg-muted)] group-hover:text-[var(--accent)] font-medium mb-1">
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-bold text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">
            {nextLink.title}
          </span>
        </Link>
      ) : <div />}
    </div>
  );
}
