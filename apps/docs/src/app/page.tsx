import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Lumi Docs",
  description: "Self-host, configure, and extend Lumi, the modular Discord bot.",
};

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--accent-strong)" }}>
        Self-hosted · Modular · Discord
      </p>
      <h1 className="mt-3 text-4xl font-bold sm:text-5xl" style={{ letterSpacing: "-0.03em", color: "var(--fg)" }}>
        One bot binary, every server managed from the web.
      </h1>
      <p className="mt-5 text-[17px]" style={{ color: "var(--fg-muted)" }}>
        Lumi is a self-hosted, modular Discord bot built on Bun, TypeScript, Sapphire, Postgres,
        and Redis. Feature modules snap in per guild, and a Next.js dashboard administers them
        over an internal RPC bridge — no bot token ever leaves the worker.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/docs/getting-started/introduction"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Read the docs <ArrowRight size={15} />
        </Link>
        <a
          href="https://github.com/lumi-devs/Lumi"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-[14.5px] font-semibold transition-colors"
          style={{ borderColor: "var(--border-soft)", color: "var(--fg)" }}
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
