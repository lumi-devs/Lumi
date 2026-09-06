"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Prism from "prismjs";
import "prismjs/components/prism-typescript.js";
import { DiscordCardPreview } from "@/components/discord-card-preview";
import { ArchitectureVisualizer } from "@/components/architecture-visualizer";
import { version } from "../../package.json";
import {
  Copy,
  Check,
  ArrowRight,
  Code2,
  Server,
  Lock,
  Cpu,
  Zap,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const CODE_EXAMPLE = `import { DefineModule, type ModuleContext } from "lumi";
import { z } from "zod";

const AutoModSchema = z.object({
  filterInvites: z.boolean().default(true),
  maxMentions: z.number().int().default(5),
});

export default DefineModule({
  name: "automod",
  displayName: "Auto Moderation",
  version: "1.0.0",
  configSchema: AutoModSchema,
  requiredPermissions: ["MANAGE_MESSAGES", "MODERATE_MEMBERS"],

  async onLoad(ctx: ModuleContext) {
    ctx.logger.info("AutoMod initialized on shard", ctx.shardId);
    await ctx.eventBus.subscribe("guild.message.create", async (event) => {
      // High-throughput Redis Streams listener
    });
  },
});`;

export default function Home() {
  const [activeShowcase, setActiveShowcase] = useState<"cards" | "addon" | "topology">("cards");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const highlightedAddonCode = useMemo(() => {
    try {
      if (Prism.languages.typescript) {
        return Prism.highlight(CODE_EXAMPLE, Prism.languages.typescript, "typescript");
      }
    } catch {
      // fallback
    }
    return CODE_EXAMPLE;
  }, []);

  const installCommand = "docker compose up -d";

  const handleCopyInstall = () => {
    void navigator.clipboard.writeText(installCommand);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(CODE_EXAMPLE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)]">
      {/* ── Hero ── */}
      <section className="hero-atmosphere mx-auto max-w-5xl px-6 pt-16 pb-14 text-center">
        {/* Version Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--fg-muted)] mb-8 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          <span className="font-semibold text-[var(--fg)]">Lumi v{version}</span>
          <span className="text-[var(--border-strong)]">•</span>
          <span className="font-mono text-[11px] text-[var(--accent-fg)] font-medium">
            Bun 1.3 & Sapphire
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-[var(--fg)] leading-[1.08] max-w-3xl mx-auto">
          Modular Discord bots, built for absolute control.
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg leading-relaxed text-[var(--fg-muted)] max-w-2xl mx-auto">
          A high-performance Discord framework powered by Bun 1.3, Sapphire, and Redis Streams.
          Micro-kernel addons, zero telemetry, and a built-in Next.js admin dashboard.
        </p>

        {/* Action Bar */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/guides/self-hosting"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--fg-on-accent)] shadow-[var(--shadow-accent)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <span>Get Started</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/architecture"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <span>Architecture</span>
          </Link>

          <Link
            href="https://github.com/lumi-devs/Lumi"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
          </Link>
        </div>

        {/* Minimal Install Pill */}
        <div className="mt-8 inline-flex items-center gap-3 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-mono shadow-sm">
          <span className="text-[var(--fg-subtle)]">$</span>
          <span className="text-[var(--fg)]">{installCommand}</span>
          <button
            onClick={handleCopyInstall}
            className="ml-2 text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors cursor-pointer"
            title="Copy command"
            aria-label="Copy install command"
          >
            {copiedInstall ? (
              <Check className="h-3.5 w-3.5 text-[var(--success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </section>

      {/* ── Interactive Showcase (Calm, Unified Window) ── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden">
          {/* Showcase Nav Tabs */}
          <div className="flex flex-wrap items-center justify-between border-b border-[var(--border)] px-4 py-3 bg-[var(--bg-subtle)] gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)] inline-block" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)] inline-block" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)] inline-block" />
            </div>

            <div className="flex items-center gap-1.5 bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)]">
              <button
                onClick={() => setActiveShowcase("cards")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeShowcase === "cards"
                    ? "bg-[var(--surface-active)] text-white shadow-sm border border-[var(--border-strong)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)] border border-transparent"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-fg)]" />
                <span>Discord Cards</span>
              </button>

              <button
                onClick={() => setActiveShowcase("addon")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeShowcase === "addon"
                    ? "bg-[var(--surface-active)] text-white shadow-sm border border-[var(--border-strong)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)] border border-transparent"
                }`}
              >
                <Code2 className="h-3.5 w-3.5 text-[var(--success)]" />
                <span>Addon SDK</span>
              </button>

              <button
                onClick={() => setActiveShowcase("topology")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeShowcase === "topology"
                    ? "bg-[var(--surface-active)] text-white shadow-sm border border-[var(--border-strong)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)] border border-transparent"
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-[#FB923C]" />
                <span>Cluster Topology</span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-[var(--fg-subtle)] hidden sm:inline">
              Interactive Preview
            </span>
          </div>

          {/* Showcase Panels */}
          <div className="p-6 sm:p-8">
            {activeShowcase === "cards" && (
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold text-white">#cards.js Component Engine</h3>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Consistent Discord UI with built-in states, field formatting, and interaction buttons.
                  </p>
                </div>
                <DiscordCardPreview />
              </div>
            )}

            {activeShowcase === "addon" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <div>
                    <h3 className="text-sm font-bold text-white">Sandboxed Micro-Kernel Addon</h3>
                    <p className="text-xs text-[var(--fg-muted)]">
                      Type-safe configuration schemas, lifecycle hooks, and Redis Streams integration.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 text-xs font-mono text-[var(--fg-muted)] hover:text-white px-2.5 py-1 rounded bg-[var(--surface-active)] border border-[var(--border)] cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                        <span className="text-[var(--success)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-[#090d16] border border-[var(--border)] text-[12.5px] font-mono leading-relaxed text-[#e2e8f0] overflow-x-auto whitespace-pre">
                  <code
                    className="language-typescript"
                    dangerouslySetInnerHTML={{ __html: highlightedAddonCode }}
                  />
                </pre>
              </div>
            )}

            {activeShowcase === "topology" && (
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold text-white">Distributed Node Topology</h3>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Click any node to inspect communication protocol, process isolation, and specs.
                  </p>
                </div>
                <ArchitectureVisualizer />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 4 Core Pillars (Spacious, Crisp Bento) ── */}
      <section className="mx-auto max-w-5xl px-6 py-16 border-t border-[var(--border)]">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Engineered for High-Concurrency Discord
          </h2>
          <p className="mt-2 text-sm text-[var(--fg-muted)] max-w-xl mx-auto">
            Everything you need for enterprise Discord operations without complexity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card-premium p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-[var(--surface-active)] border border-[var(--border)] text-[var(--accent-fg)]">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">Bun 1.3 Native Engine</h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
                Native TypeScript execution, instant 120ms cold boot times, and optimized memory usage. No build steps required for development.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--border-soft)] text-[11px] font-mono text-[var(--accent-fg)]">
              3.2x faster cold start than Node.js
            </div>
          </div>

          <div className="card-premium p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-[var(--surface-active)] border border-[var(--border)] text-[var(--success)]">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">Zero Telemetry & GDPR</h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
                100% self-hosted with no external tracking or phoning home. Automated cron workers purge message logs and audit records after 30 days.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--border-soft)] text-[11px] font-mono text-[var(--success)]">
              100% data sovereign
            </div>
          </div>

          <div className="card-premium p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-[var(--surface-active)] border border-[var(--border)] text-[#FB923C]">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">Redis Streams Event Bus</h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
                Decoupled cross-process fanout with at-least-once delivery guarantees. Single-flight caching prevents database stampedes under load.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--border-soft)] text-[11px] font-mono text-[#FB923C]">
              Zero-drop stream consumer groups
            </div>
          </div>

          <div className="card-premium p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-[var(--surface-active)] border border-[var(--border)] text-[#a78bfa]">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-white">Micro-Kernel Addons</h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
                Addons run isolated with typed Zod schemas, independent permissions, and safe lifecycle hooks. Hot-reload modules without restarting the bot.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--border-soft)] text-[11px] font-mono text-[#a78bfa]">
              Hot-swappable module registry
            </div>
          </div>
        </div>
      </section>

      {/* ── Developer Tracks ── */}
      <section className="mx-auto max-w-5xl px-6 py-16 border-t border-[var(--border)]">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Documentation Tracks
          </h2>
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Explore step-by-step guides tailored for your role.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Link
            href="/guides/self-hosting"
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--accent)] transition-all flex flex-col justify-between"
          >
            <div>
              <div className="p-2 w-fit rounded-lg bg-[var(--surface-active)] text-[var(--accent-fg)] mb-4">
                <Server className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-[var(--accent-fg)] transition-colors">
                Self-Hosting
              </h3>
              <p className="text-xs text-[var(--fg-muted)] mt-2 leading-relaxed">
                Docker Compose, PostgreSQL setup, Redis configuration, and production hardening.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-[var(--accent-fg)]">
              <span>Read guide</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/guides/quick-start-addon"
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--success)] transition-all flex flex-col justify-between"
          >
            <div>
              <div className="p-2 w-fit rounded-lg bg-[var(--surface-active)] text-[var(--success)] mb-4">
                <Code2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-[var(--success)] transition-colors">
                Addon Development
              </h3>
              <p className="text-xs text-[var(--fg-muted)] mt-2 leading-relaxed">
                Build custom modules using the TypeScript SDK, Zod schemas, and Sapphire commands.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-[var(--success)]">
              <span>Read guide</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link
            href="/dashboard"
            className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[#FB923C] transition-all flex flex-col justify-between"
          >
            <div>
              <div className="p-2 w-fit rounded-lg bg-[var(--surface-active)] text-[#FB923C] mb-4">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-white group-hover:text-[#FB923C] transition-colors">
                Administration
              </h3>
              <p className="text-xs text-[var(--fg-muted)] mt-2 leading-relaxed">
                Next.js 16 dashboard, Permit RBAC trees, moderation cases, and GDPR management.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-[#FB923C]">
              <span>Read guide</span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
