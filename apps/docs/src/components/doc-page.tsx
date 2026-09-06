import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { allLinks } from "@/lib/navigation";

interface DocPageProps {
  title: string;
  lede: string;
  path: string;
  children: ReactNode;
}

export function DocPage({ title, lede, path, children }: DocPageProps) {
  const index = allLinks.findIndex((link) => link.href === path);
  const prev = index > 0 ? allLinks[index - 1] : undefined;
  const next = index >= 0 && index < allLinks.length - 1 ? allLinks[index + 1] : undefined;

  return (
    <article className="doc-shell min-w-0 max-w-3xl">
      <p
        className="font-mono text-[12px] uppercase tracking-[0.16em]"
        style={{ color: "var(--accent-strong)" }}
      >
        Lumi
      </p>
      <h1 className="mt-2">{title}</h1>
      <p className="text-[17px]" style={{ color: "var(--fg-muted)" }}>
        {lede}
      </p>
      <div className="mt-2">{children}</div>
      {(prev ?? next) && (
        <div
          className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
          style={{ borderColor: "var(--border-soft)" }}
        >
          {prev ? (
            <Link
              href={prev.href}
              className="group rounded-[10px] border p-4 transition-colors"
              style={{ borderColor: "var(--border-soft)" }}
            >
              <span
                className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--fg-faint)" }}
              >
                <ArrowLeft size={13} /> Previous
              </span>
              <span className="mt-1 block text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={next.href}
              className="group rounded-[10px] border p-4 text-right transition-colors"
              style={{ borderColor: "var(--border-soft)" }}
            >
              <span
                className="flex items-center justify-end gap-1.5 text-[12px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--fg-faint)" }}
              >
                Next <ArrowRight size={13} />
              </span>
              <span className="mt-1 block text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                {next.title}
              </span>
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
