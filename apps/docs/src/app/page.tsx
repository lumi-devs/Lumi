"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { DiscordCardPreview } from "@/components/discord-card-preview";
import { ArchitectureVisualizer } from "@/components/architecture-visualizer";
import { useStaggerIn, SPRING_SOFT } from "@/lib/animate";
import {
  Copy,
  Check,
  ArrowRight,
  Sliders,
  Server,
  Code2,
  Terminal,
  Boxes,
  Lock,
} from "lucide-react";

const MotionLink = motion(Link);

/** Primary CTA that nudges toward the cursor, capped to a small radius. */
function MagneticCta({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING_SOFT);
  const springY = useSpring(y, SPRING_SOFT);

  if (reduce) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  function onMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-8, Math.min(8, relX * 0.3)));
    y.set(Math.max(-8, Math.min(8, relY * 0.3)));
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <MotionLink
      ref={ref}
      href={href}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </MotionLink>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"docker" | "setup" | "addon">("docker");
  const [copied, setCopied] = useState(false);
  const tracksRef = useStaggerIn<HTMLDivElement>(":scope > div", { delay: 90 });

  const snippets = {
    docker: "# 1. Download production docker-compose and sample env\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env\n\n# 2. Configure BOT_TOKEN & CLIENT_ID in .env, then boot the stack:\ndocker compose up -d",
    setup: "# Local development / contributor setup from source\ngit clone https://github.com/lumi-devs/Lumi.git\ncd Lumi\nbun run setup",
    addon: "# Scaffold an isolated addon submodule with CLI generator\nbun run addon:create my-addon --dir ./addons",
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <div className="hero-atmosphere mx-auto max-w-[1700px] px-6 lg:px-10 pb-16 pt-12 lg:flex lg:py-20 items-center justify-between gap-12">
        <div className="rise mx-auto max-w-3xl lg:mx-0 lg:max-w-2xl lg:flex-shrink-0">
          {/* Version / Framework Identifier */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-xs text-[var(--fg-muted)] mb-6 shadow-[var(--shadow-sm)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            <span className="font-semibold text-[var(--fg)]">Lumi Framework v1.0.0</span>
            <span className="text-[var(--border-strong)]">•</span>
            <span className="font-mono text-[11px] text-[var(--accent)] font-semibold uppercase tracking-wider">
              Self-Hosted & Modular
            </span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--fg)] sm:text-6xl lg:text-7xl leading-[1.08]">
            The Modular Discord Bot Framework for Bun & Sapphire.
          </h1>

          <p className="mt-6 text-base sm:text-lg leading-relaxed text-[var(--fg-body)] max-w-xl">
            Engineered with Bun 1.3, Sapphire Framework, Prisma/PostgreSQL, Redis Streams, and a Next.js 16 admin dashboard. Fully self-hosted with zero telemetry, complete module isolation, and GDPR data governance.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <MagneticCta
              href="/guides/self-hosting"
              className="group relative inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-[var(--fg-on-accent)] shadow-[var(--shadow-accent)] hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              <span>Deploy with Docker</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </MagneticCta>
            <Link
              href="/architecture"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-3.5 text-sm font-semibold text-[var(--fg)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all cursor-pointer"
            >
              <span>System Topology</span>
            </Link>
          </div>

          {/* Quick Install Interactive Terminal */}
          <div className="mt-10 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] text-xs">
              <div className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-[var(--accent)]" />
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setActiveTab("docker")}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                      activeTab === "docker"
                        ? "bg-[var(--surface-active)] text-[var(--fg)] border border-[var(--border-strong)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    docker-compose.yml
                  </button>
                  <button
                    onClick={() => setActiveTab("setup")}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                      activeTab === "setup"
                        ? "bg-[var(--surface-active)] text-[var(--fg)] border border-[var(--border-strong)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    bun run setup
                  </button>
                  <button
                    onClick={() => setActiveTab("addon")}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                      activeTab === "addon"
                        ? "bg-[var(--surface-active)] text-[var(--fg)] border border-[var(--border-strong)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    addon:create
                  </button>
                </div>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs font-mono text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors cursor-pointer px-2 py-1 rounded hover:bg-[var(--surface-active)]"
                title="Copy command"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <pre className="p-4 text-[13px] font-mono leading-relaxed text-[var(--accent-fg)] overflow-x-auto whitespace-pre">
              <code>{snippets[activeTab]}</code>
            </pre>
          </div>
        </div>

        {/* Live Interactive Embed Simulator Showcase */}
        <div className="mx-auto mt-12 flex max-w-2xl lg:mx-0 lg:mt-0 lg:max-w-none lg:flex-none xl:w-[620px]">
          <div className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)] text-xs text-[var(--fg-muted)]">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#12B886]" />
                <span className="font-semibold text-white">Interactive Discord Card Simulator</span>
              </div>
              <span className="font-mono text-[10px] bg-[var(--surface-active)] px-2.5 py-0.5 rounded border border-[var(--border)] text-[var(--accent)] font-semibold uppercase">
                #cards.js
              </span>
            </div>
            <DiscordCardPreview />
          </div>
        </div>
      </div>

      {/* Interactive System Topology Visualizer Section */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 py-12">
        <ArchitectureVisualizer />
      </div>

      {/* Persona-Grouped Documentation Tracks */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-28 pt-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--accent)] font-semibold mb-3">
            <Boxes className="h-3.5 w-3.5" />
            <span>DOCUMENTATION DIRECTORY</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Choose Your Development Path
          </h2>
          <p className="mt-3 text-sm text-[var(--fg-muted)]">
            Explore comprehensive guides tailored for self-hosters, addon creators, and Discord server operators.
          </p>
        </div>

        <div ref={tracksRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Track 1: Self-Hosting & Operations */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-[var(--surface-active)] border border-[var(--border)] text-[var(--accent)]">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--fg-subtle)] font-bold">
                    DevOps & Infrastructure
                  </div>
                  <h3 className="text-lg font-bold text-white">Self-Hosting & Operations</h3>
                </div>
              </div>
              <p className="text-xs text-[var(--fg-body)] leading-relaxed mb-6">
                Boot and supervise production Lumi bot clusters with Docker Compose, PgBouncer pooling, Redis Streams, and Prometheus monitoring.
              </p>

              <div className="space-y-2 text-xs">
                <Link
                  href="/guides/self-hosting"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[var(--accent)] transition-colors"
                >
                  <span className="font-medium">Docker Compose Quickstart</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/configuration"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[var(--accent)] transition-colors"
                >
                  <span className="font-medium">Configuration Reference (.env)</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/sharding"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[var(--accent)] transition-colors"
                >
                  <span className="font-medium">Distributed Sharding & Cluster</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/guides/production-deployment"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[var(--accent)] transition-colors"
                >
                  <span className="font-medium">Production Hardening & Backups</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
              </div>
            </div>
          </div>

          {/* Track 2: Addon Development */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-[var(--surface-active)] border border-[var(--border)] text-[#12B886]">
                  <Code2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--fg-subtle)] font-bold">
                    TypeScript SDK
                  </div>
                  <h3 className="text-lg font-bold text-white">Addon Development</h3>
                </div>
              </div>
              <p className="text-xs text-[var(--fg-body)] leading-relaxed mb-6">
                Build isolated, zero-leak submodules using the stable <code className="text-[#93C5FD]">lumi</code> package with typed configuration schemas and lifecycle hooks.
              </p>

              <div className="space-y-2 text-xs">
                <Link
                  href="/guides/quick-start-addon"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#12B886] transition-colors"
                >
                  <span className="font-medium">Quick Start Addon Guide</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/guides/module-creation"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#12B886] transition-colors"
                >
                  <span className="font-medium">@DefineModule Architecture</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/api-reference"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#12B886] transition-colors"
                >
                  <span className="font-medium">Addon SDK API Reference</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/guides/addon-publishing"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#12B886] transition-colors"
                >
                  <span className="font-medium">Publishing & Manifest Validation</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
              </div>
            </div>
          </div>

          {/* Track 3: Administration & Governance */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-[var(--surface-active)] border border-[var(--border)] text-[#FB923C]">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--fg-subtle)] font-bold">
                    Administration & Privacy
                  </div>
                  <h3 className="text-lg font-bold text-white">Governance & Security</h3>
                </div>
              </div>
              <p className="text-xs text-[var(--fg-body)] leading-relaxed mb-6">
                Enforce granular permit RBAC, inspect the 66-action web dashboard RPC bridge, and maintain GDPR compliance with automated erasure sweeps.
              </p>

              <div className="space-y-2 text-xs">
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#FB923C] transition-colors"
                >
                  <span className="font-medium">Web Admin Dashboard (Next.js 16)</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/permissions"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#FB923C] transition-colors"
                >
                  <span className="font-medium">Permit Nodes & RBAC Hierarchy</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/privacy"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#FB923C] transition-colors"
                >
                  <span className="font-medium">GDPR & Data Retention Governance</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
                <Link
                  href="/license"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-soft)] text-white hover:text-[#FB923C] transition-colors"
                >
                  <span className="font-medium">GPL-3.0 License & SDK Terms</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
