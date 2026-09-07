import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, LayoutDashboard, Plug, Rocket, Server, Terminal } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { rpcActionCount } from "@/lib/rpc-actions";

export const metadata: Metadata = {
  title: "Lumi Docs",
  description: "Self-host, configure, and extend Lumi, the modular Discord bot.",
};

const quickstart = `nix develop
cp .env.example .env   # fill in BOT_TOKEN + secrets
docker compose up -d`;

const cards = [
  {
    icon: Rocket,
    title: "Getting Started",
    body: "Run the whole stack locally with Nix and Compose, from first boot to an online bot.",
    href: "/getting-started",
  },
  {
    icon: Server,
    title: "Architecture",
    body: "Sharded worker fleet, RPC bridge, Postgres, and the Redis event bus — how the pieces fit.",
    href: "/architecture",
  },
  {
    icon: Boxes,
    title: "Module Creation",
    body: "DefineModule, typed config schemas, and the rules every module follows.",
    href: "/modules",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: "The Next.js admin panel: auth, guild pages, and the server-only RPC client.",
    href: "/dashboard",
  },
  {
    icon: Plug,
    title: "Add-ons",
    body: "Ship third-party modules against the stable lumi import surface.",
    href: "/addons",
  },
  {
    icon: Terminal,
    title: "RPC Reference",
    body: `All ${rpcActionCount} dashboard-to-worker actions, grouped with their payloads.`,
    href: "/rpc",
  },
];

export default function Home() {
  return (
    <div className="doc-shell min-w-0">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--accent-strong)" }}>
        Self-hosted · Modular · Discord
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
        One bot binary, every server managed from the web.
      </h1>
      <p className="mt-5 max-w-2xl text-[17px]" style={{ color: "var(--fg-muted)" }}>
        Lumi is a self-hosted, modular Discord bot built on Bun, TypeScript, Sapphire, Postgres,
        and Redis. Feature modules snap in per guild, and a Next.js dashboard administers them
        over an internal RPC bridge — no bot token ever leaves the worker.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/getting-started"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Get started <ArrowRight size={15} />
        </Link>
        <Link
          href="/architecture"
          className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-[14.5px] font-semibold transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--fg)" }}
        >
          How it works
        </Link>
      </div>

      <div className="mt-10 max-w-2xl">
        <CodeBlock code={quickstart} language="bash" title="Quickstart" />
      </div>

      <h2 className="mt-16">Read the docs</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-[12px] border p-5 transition-colors"
            style={{ borderColor: "var(--border-soft)", background: "var(--bg-raise)" }}
          >
            <card.icon size={18} style={{ color: "var(--accent-strong)" }} />
            <p className="mt-3 text-[15.5px] font-semibold" style={{ color: "var(--fg)" }}>
              {card.title}
            </p>
            <p className="mt-1 text-[14px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              {card.body}
            </p>
            <span
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold"
              style={{ color: "var(--accent-strong)" }}
            >
              Read
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
