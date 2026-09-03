"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Check, GitBranch, ExternalLink, Sparkles } from "lucide-react";
import clsx from "clsx";
import { version } from "../../package.json";

export interface VersionOption {
  label: string;
  version: string;
  tag: string;
  status: "latest" | "pre-release" | "archived";
  isCurrent?: boolean;
}

const VERSIONS: VersionOption[] = [
  {
    label: `v${version} (main)`,
    version: version,
    tag: "latest",
    status: "latest",
    isCurrent: true,
  },
];

export function VersionSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-active)] px-2.5 py-1 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)] transition-all shadow-sm focus:outline-none cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]"></span>
        </span>
        <span className="font-mono font-semibold">v{version} (main)</span>
        <ChevronDown className={clsx("h-3 w-3 text-[var(--fg-muted)] transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="glass absolute left-0 mt-2 w-64 origin-top-left rounded-xl border border-[var(--border-strong)] p-2 shadow-[var(--shadow-lg)] z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
            Documentation Versions
          </div>
          <div className="space-y-1">
            {VERSIONS.map((v, i) => (
              <div
                key={i}
                onClick={() => setIsOpen(false)}
                className={clsx(
                  "flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer",
                  v.isCurrent
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                  <span>{v.label}</span>
                </div>
                {v.isCurrent && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
              </div>
            ))}
          </div>

          <div className="my-1.5 border-t border-[var(--border)]" />

          <div className="space-y-1">
            <Link
              href="https://github.com/lumi-devs/Lumi/releases"
              target="_blank"
              rel="noreferrer"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--fg)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[var(--warning)]" />
                <span>Releases & Changelog</span>
              </span>
              <ExternalLink className="h-3 w-3 text-[var(--fg-subtle)]" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
