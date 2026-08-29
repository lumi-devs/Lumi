"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { DiscordCardPreview } from "@/components/discord-card-preview";
import { MathCanvas } from "@/components/math-canvas";
import {
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  LayoutDashboard,
  Layers,
  Sparkles,
  ArrowRight,
  Database,
  KeyRound,
  Sliders,
  Zap,
  Server,
  Lock,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"docker" | "setup" | "addon">("docker");
  const [copied, setCopied] = useState(false);

  const snippets = {
    docker: "# 1. Quickest production install with official Docker images\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env\n# 2. Fill in BOT_TOKEN & CLIENT_ID in .env, then:\ndocker compose up -d",
    setup: "# Local development / contributor setup from source\ngit clone https://github.com/lumi-devs/Lumi.git\ncd Lumi\nbun run setup",
    addon: "# Scaffold a new isolated addon module with CLI\nbun run addon:create my-addon --dir ./addons",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Mathematical Parametric Geometry Canvas Background */}
      <MathCanvas />

      {/* Floating HUD Telemetry Nodes (Zeon-style) */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden xl:block max-w-[1700px] mx-auto">
        <div className="absolute top-[22%] left-[3%] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4C6EF5]/30 bg-[#0B0F19]/80 backdrop-blur-md text-[11px] text-[#748FFC]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C6EF5] animate-pulse" />
          <span className="font-semibold">Event Bus</span>
          <span className="text-[var(--fg-subtle)] font-mono">0.34 ms</span>
        </div>

        <div className="absolute top-[18%] right-[4%] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#12B886]/30 bg-[#0B0F19]/80 backdrop-blur-md text-[11px] text-[#20C997]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#12B886] animate-pulse" />
          <span className="font-semibold">Gateway Shard Sync</span>
          <span className="text-[var(--fg-subtle)] font-mono">1.21 ms</span>
        </div>

        <div className="absolute top-[52%] left-[2%] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FB923C]/30 bg-[#0B0F19]/80 backdrop-blur-md text-[11px] text-[#FB923C]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FB923C] animate-pulse" />
          <span className="font-semibold">RPC Bridge (8091)</span>
          <span className="text-[var(--fg-subtle)] font-mono">66 Actions</span>
        </div>

        <div className="absolute top-[56%] right-[3%] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#F472B6]/30 bg-[#0B0F19]/80 backdrop-blur-md text-[11px] text-[#F472B6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F472B6] animate-pulse" />
          <span className="font-semibold">GDPR Retention</span>
          <span className="text-[var(--fg-subtle)] font-mono">90d / 365d</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-16 pt-12 lg:flex lg:py-24 items-center justify-between gap-12">
        <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-2xl lg:flex-shrink-0">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Live Telemetry Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)]/90 backdrop-blur-md text-xs text-[var(--fg-muted)] mb-8 shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#12B886] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#12B886]"></span>
              </span>
              <span className="font-semibold text-white">Lumi Framework v1.0.0</span>
              <span className="text-[var(--border-strong)]">•</span>
              <span>Next-Gen Modular Discord Bot Architecture</span>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.08]">
              The Modular Discord Bot Built for{" "}
              <span className="bg-gradient-to-r from-[#748FFC] via-[#4C6EF5] to-[#20C997] bg-clip-text text-transparent">
                Total Control
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-[#CBD5E1] max-w-xl">
              Engineered with Bun 1.3, Sapphire Framework, Prisma/PostgreSQL, Redis Streams, and a Next.js admin dashboard. Fully self-hosted with zero telemetry and GDPR data governance.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/guides/self-hosting"
                className="group relative inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#4C6EF5]/20 hover:bg-[var(--accent-hover)] transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>Deploy with Docker</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/architecture"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]/80 px-6 py-3.5 text-sm font-semibold text-[#F8FAFC] backdrop-blur-md hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] transition-all cursor-pointer"
              >
                <span>System Architecture</span>
              </Link>
            </div>

            {/* Quick Install Interactive Terminal */}
            <div className="mt-10 rounded-2xl border border-[var(--border-strong)] bg-[#0A0E17]/95 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-active)]/80 border-b border-[var(--border-strong)] text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => setActiveTab("docker")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        activeTab === "docker"
                          ? "bg-[var(--surface)] text-white border border-[var(--border-strong)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-white"
                      }`}
                    >
                      Docker Compose (Prod)
                    </button>
                    <button
                      onClick={() => setActiveTab("setup")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        activeTab === "setup"
                          ? "bg-[var(--surface)] text-white border border-[var(--border-strong)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-white"
                      }`}
                    >
                      Dev Setup (Bun)
                    </button>
                    <button
                      onClick={() => setActiveTab("addon")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        activeTab === "addon"
                          ? "bg-[var(--surface)] text-white border border-[var(--border-strong)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-white"
                      }`}
                    >
                      Scaffold Addon
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-white transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-[var(--surface-hover)] border border-transparent hover:border-[var(--border)]"
                  title="Copy command"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#12B886]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="p-4 text-[13px] font-mono leading-relaxed text-[#93C5FD] overflow-x-auto whitespace-pre">
                <code>{snippets[activeTab]}</code>
              </pre>
            </div>
          </motion.div>
        </div>

        {/* Live Interactive Embed Simulator Showcase */}
        <div className="mx-auto mt-12 flex max-w-2xl lg:mx-0 lg:mt-0 lg:max-w-none lg:flex-none xl:w-[620px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="w-full relative"
          >
            {/* Ambient Sapphire Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#4C6EF5]/30 to-[#12B886]/30 rounded-3xl blur-2xl -z-10" />

            <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)]/90 backdrop-blur-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[var(--border)] text-xs text-[var(--fg-muted)]">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-[#12B886]" />
                  <span className="font-semibold text-white">Interactive Discord Card Simulator</span>
                </div>
                <span className="font-mono text-[11px] bg-[var(--surface-active)] px-2 py-0.5 rounded border border-[var(--border)]">#cards.js</span>
              </div>
              <DiscordCardPreview />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Real-time Fleet Metrics Bar (Zeon-style) */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 py-6 border-y border-[var(--border)] bg-[#0B0F19]/60 backdrop-blur-xl mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--fg-muted)] font-medium">
              <Server className="h-3.5 w-3.5 text-[#12B886]" />
              <span>Gateway Uptime</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight font-mono">99.98%</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--fg-muted)] font-medium">
              <Zap className="h-3.5 w-3.5 text-[#748FFC]" />
              <span>Event Bus Latency</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight font-mono">&lt;0.4 ms</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--fg-muted)] font-medium">
              <Cpu className="h-3.5 w-3.5 text-[#FB923C]" />
              <span>RPC Dispatch Bridge</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight font-mono">66 Actions</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--fg-muted)] font-medium">
              <Lock className="h-3.5 w-3.5 text-[#F472B6]" />
              <span>GDPR Governance</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight font-mono">100% Sovereign</div>
          </div>
        </div>
      </div>

      {/* Quick Doc Navigation Pills */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-12">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {[
            { label: "🚀 Self-Hosting", href: "/guides/self-hosting" },
            { label: "⚙️ Configuration", href: "/configuration" },
            { label: "🧩 Addon SDK", href: "/guides/quick-start-addon" },
            { label: "⚡ Distributed Sharding", href: "/sharding" },
            { label: "📊 Web Dashboard", href: "/dashboard" },
            { label: "🛡️ Permissions (RBAC)", href: "/permissions" },
            { label: "🔐 GDPR Privacy", href: "/privacy" },
            { label: "📖 API Reference", href: "/api-reference" },
          ].map((item, i) => (
            <Link
              key={i}
              href={item.href}
              className="px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]/80 hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] text-xs font-medium text-white transition-all shadow-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Asymmetric Zeon/Mintlify-Style Color-Coded Bento Grid */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-28 pt-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-xs text-[#748FFC] font-semibold mb-4 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Architecture & Framework Engine</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight sm:text-5xl">
            Engineered for Sovereign Scaling
          </h2>
          <p className="mt-4 text-base text-[#94A3B8] leading-relaxed">
            Every layer designed from the ground up for modularity, isolation, and uncompromising performance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[1fr]">
          {/* Card 1: Addon SDK (2 cols wide) */}
          <Link href="/guides/quick-start-addon" className="group lg:col-span-2 block h-full">
            <div className="h-full p-8 md:p-10 rounded-3xl border border-[#4C6EF5]/30 bg-gradient-to-br from-[#4C6EF5]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#748FFC] hover:shadow-2xl hover:shadow-[#4C6EF5]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#4C6EF5]/30 bg-[#4C6EF5]/10 shadow-inner">
                  <Layers className="h-7 w-7 text-[#748FFC]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#4C6EF5]/20 text-[#748FFC] border border-[#4C6EF5]/30">
                    Addon SDK
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#4C6EF5] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-[#748FFC] transition-colors">
                  Zero-Leak Modular Addon SDK
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed max-w-2xl">
                  Isolate features into independent submodules with strict boundary validation. Unified <code className="bg-[#0B0F19] text-[#748FFC] px-1.5 py-0.5 rounded font-mono">@DefineModule</code> lifecycle hooks, typed config schemas via <code className="bg-[#0B0F19] text-[#748FFC] px-1.5 py-0.5 rounded font-mono">cfg.string</code>, and zero cross-module memory leakage.
                </p>
              </div>
            </div>
          </Link>

          {/* Card 2: Distributed Sharding (1 col) */}
          <Link href="/sharding" className="group block h-full">
            <div className="h-full p-8 rounded-3xl border border-[#12B886]/30 bg-gradient-to-br from-[#12B886]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#20C997] hover:shadow-2xl hover:shadow-[#12B886]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#12B886]/30 bg-[#12B886]/10 shadow-inner">
                  <Cpu className="h-7 w-7 text-[#20C997]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#12B886]/20 text-[#20C997] border border-[#12B886]/30">
                    Sharding
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#12B886] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2.5 group-hover:text-[#20C997] transition-colors">
                  Distributed Sharding & Event Bus
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  Child process isolation per gateway shard coordinated with Redis Streams for synchronized scheduled tasks and zero-coordination primary election.
                </p>
              </div>
            </div>
          </Link>

          {/* Card 3: Next.js Admin Dashboard (1 col) */}
          <Link href="/dashboard" className="group block h-full">
            <div className="h-full p-8 rounded-3xl border border-[#FB923C]/30 bg-gradient-to-br from-[#FB923C]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#FB923C] hover:shadow-2xl hover:shadow-[#FB923C]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#FB923C]/30 bg-[#FB923C]/10 shadow-inner">
                  <LayoutDashboard className="h-7 w-7 text-[#FB923C]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FB923C]/20 text-[#FB923C] border border-[#FB923C]/30">
                    Dashboard
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#FB923C] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2.5 group-hover:text-[#FB923C] transition-colors">
                  Next.js 16 Web Admin Panel
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  Manage modules and permissions over an internal 66-action HTTP RPC bridge on port 8091 without bot token or database exposure.
                </p>
              </div>
            </div>
          </Link>

          {/* Card 4: GDPR Privacy (1 col) */}
          <Link href="/privacy" className="group block h-full">
            <div className="h-full p-8 rounded-3xl border border-[#F472B6]/30 bg-gradient-to-br from-[#F472B6]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#F472B6] hover:shadow-2xl hover:shadow-[#F472B6]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F472B6]/30 bg-[#F472B6]/10 shadow-inner">
                  <ShieldCheck className="h-7 w-7 text-[#F472B6]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F472B6]/20 text-[#F472B6] border border-[#F472B6]/30">
                    GDPR
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#F472B6] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2.5 group-hover:text-[#F472B6] transition-colors">
                  GDPR & Privacy Governance
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  Automated 90d/365d retention sweeps, manifest privacy disclosures, and universal deleteUserData right-to-erasure hooks.
                </p>
              </div>
            </div>
          </Link>

          {/* Card 5: Database & Prisma (1 col) */}
          <Link href="/database" className="group block h-full">
            <div className="h-full p-8 rounded-3xl border border-[#38BDF8]/30 bg-gradient-to-br from-[#38BDF8]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#38BDF8] hover:shadow-2xl hover:shadow-[#38BDF8]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#38BDF8]/30 bg-[#38BDF8]/10 shadow-inner">
                  <Database className="h-7 w-7 text-[#38BDF8]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30">
                    Database
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#38BDF8] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2.5 group-hover:text-[#38BDF8] transition-colors">
                  Prisma ORM & Repositories
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  Centralized repository pattern on container.db with PgBouncer connection pooling and in-memory offline mock testing.
                </p>
              </div>
            </div>
          </Link>

          {/* Card 6: Permit RBAC (2 cols wide) */}
          <Link href="/permissions" className="group lg:col-span-2 block h-full">
            <div className="h-full p-8 md:p-10 rounded-3xl border border-[#A855F7]/30 bg-gradient-to-br from-[#A855F7]/15 via-[var(--surface)] to-[var(--surface)] backdrop-blur-xl shadow-xl hover:border-[#C084FC] hover:shadow-2xl hover:shadow-[#A855F7]/20 transition-all flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#A855F7]/30 bg-[#A855F7]/10 shadow-inner">
                  <KeyRound className="h-7 w-7 text-[#C084FC]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#A855F7]/20 text-[#C084FC] border border-[#A855F7]/30">
                    Permit RBAC
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] group-hover:bg-[#A855F7] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4 -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-[#C084FC] transition-colors">
                  Hierarchical Permit Nodes & Permissions
                </h3>
                <p className="text-sm text-[#CBD5E1] leading-relaxed max-w-2xl">
                  UNIX-style dot-notation permission nodes with automatic autocomplete suggestions, wildcard expansion (<code className="bg-[#0B0F19] text-[#C084FC] px-1.5 py-0.5 rounded font-mono">admin.*</code>, <code className="bg-[#0B0F19] text-[#C084FC] px-1.5 py-0.5 rounded font-mono">mod.*</code>), per-guild role overrides, and channel permit masks.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
