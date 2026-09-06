import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { siteName } from "@/lib/navigation";

export const metadata: Metadata = {
  title: {
    default: "Lumi Docs",
    template: "%s — Lumi Docs",
  },
  description: "Self-host, configure, and extend Lumi, the modular Discord bot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header
          className="sticky top-0 z-40 border-b backdrop-blur"
          style={{ borderColor: "var(--border-soft)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
        >
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}
              >
                <BookOpen size={16} style={{ color: "var(--accent-strong)" }} />
              </span>
              <span className="text-[15px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>
                {siteName}
              </span>
            </Link>
            <div className="flex items-center gap-4 text-[13.5px]" style={{ color: "var(--fg-muted)" }}>
              <Link href="/getting-started" className="hidden transition-colors hover:text-white sm:inline">
                Get started
              </Link>
              <Link href="/rpc" className="hidden transition-colors hover:text-white sm:inline">
                RPC reference
              </Link>
              <a
                href="https://github.com/lumi-devs/Lumi"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                GitHub
              </a>
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="grid gap-2 lg:hidden">
              <details
                className="rounded-[10px] border"
                style={{ borderColor: "var(--border-soft)", background: "var(--bg-raise)" }}
              >
                <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
                  Browse sections
                </summary>
                <div className="border-t px-4 py-4" style={{ borderColor: "var(--border-soft)" }}>
                  <Sidebar />
                </div>
              </details>
            </div>
            <div className="hidden lg:block">
              <Sidebar />
            </div>
          </aside>
          <main className="min-w-0 pb-16">{children}</main>
        </div>
      </body>
    </html>
  );
}
