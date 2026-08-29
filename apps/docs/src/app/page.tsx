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
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"docker" | "setup" | "addon">("docker");
  const [copied, setCopied] = useState(false);

  const snippets = {
    docker: "# Quickest production install with official Docker images\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/docker-compose.yml -o docker-compose.yml\ncurl -fsSL https://raw.githubusercontent.com/lumi-devs/Lumi/main/.env.example -o .env\n# Fill in BOT_TOKEN & CLIENT_ID in .env, then:\ndocker compose up -d",
    setup: "# Local development / contributor setup from source\ngit clone https://github.com/lumi-devs/Lumi.git\ncd Lumi\nbun run setup",
    addon: "# Scaffold a new isolated addon module\nbun run addon:create my-addon --dir ./addons",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const features = [
    {
      icon: <Layers className="h-6 w-6 text-[#748FFC]" />,
      badge: "Addon SDK",
      badgeColor: "bg-[#4C6EF5]/15 text-[#748FFC] border-[#4C6EF5]/30",
      glowColor: "from-[#4C6EF5]/20 via-[#4C6EF5]/5 to-transparent",
      borderColor: "hover:border-[#748FFC]/60 hover:shadow-[#4C6EF5]/20",
      title: "Modular Addon SDK",
      desc: "Isolate features into independent submodules. Zero cross-module leaks, unified @DefineModule lifecycle, and typed runtime config schemas.",
      href: "/guides/quick-start-addon",
    },
    {
      icon: <Cpu className="h-6 w-6 text-[#20C997]" />,
      badge: "Distributed Fleet",
      badgeColor: "bg-[#12B886]/15 text-[#20C997] border-[#12B886]/30",
      glowColor: "from-[#12B886]/20 via-[#12B886]/5 to-transparent",
      borderColor: "hover:border-[#20C997]/60 hover:shadow-[#12B886]/20",
      title: "Distributed Sharding & Event Bus",
      desc: "Native discord.js child process sharding coordinated with Redis Streams for atomic, synchronized scheduled tasks and cluster event dispatch.",
      href: "/sharding",
    },
    {
      icon: <LayoutDashboard className="h-6 w-6 text-[#FB923C]" />,
      badge: "Next.js 16 Panel",
      badgeColor: "bg-[#FB923C]/15 text-[#FB923C] border-[#FB923C]/30",
      glowColor: "from-[#FB923C]/20 via-[#FB923C]/5 to-transparent",
      borderColor: "hover:border-[#FB923C]/60 hover:shadow-[#FB923C]/20",
      title: "Web Admin Dashboard",
      desc: "Manage your bot fleet via an internal 66-action HTTP RPC bridge. Zero bot token or database exposure to the dashboard frontend.",
      href: "/dashboard",
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-[#F472B6]" />,
      badge: "GDPR Compliant",
      badgeColor: "bg-[#F472B6]/15 text-[#F472B6] border-[#F472B6]/30",
      glowColor: "from-[#F472B6]/20 via-[#F472B6]/5 to-transparent",
      borderColor: "hover:border-[#F472B6]/60 hover:shadow-[#F472B6]/20",
      title: "GDPR & Privacy Governance",
      desc: "Automated 90-day/365-day data retention sweeps, mandatory manifest privacy disclosures, and universal deleteUserData erasure hooks.",
      href: "/privacy",
    },
    {
      icon: <Database className="h-6 w-6 text-[#38BDF8]" />,
      badge: "Prisma Tier",
      badgeColor: "bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/30",
      glowColor: "from-[#38BDF8]/20 via-[#38BDF8]/5 to-transparent",
      borderColor: "hover:border-[#38BDF8]/60 hover:shadow-[#38BDF8]/20",
      title: "PostgreSQL & DatabaseService",
      desc: "Centralized repository pattern with PgBouncer connection pooling, unpooled direct migration channels, and in-memory offline mock drivers.",
      href: "/database",
    },
    {
      icon: <KeyRound className="h-6 w-6 text-[#C084FC]" />,
      badge: "Permit RBAC",
      badgeColor: "bg-[#A855F7]/15 text-[#C084FC] border-[#A855F7]/30",
      glowColor: "from-[#A855F7]/20 via-[#A855F7]/5 to-transparent",
      borderColor: "hover:border-[#C084FC]/60 hover:shadow-[#A855F7]/20",
      title: "Permit Nodes & Permissions",
      desc: "Dot-notation permit hierarchy with autocomplete, wildcard expansion, role/channel overrides, and typed CommandContext gating.",
      href: "/permissions",
    },
  ];

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Mathematical Parametric Geometry Canvas Background */}
      <MathCanvas />

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
              <span className="font-semibold text-white">Lumi Framework</span>
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
                  {copied ? <Check className="h-3.5 w-3.5 text-[#12B886]" /> : <Copy className="h-3.5 w-3.5 text-[var(--fg-muted)]" />}
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

      {/* 6-Card Color-Coded Bento Grid */}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <Link key={i} href={feature.href} className="block group">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className={`h-full p-7 rounded-2xl border border-[var(--border-strong)] bg-gradient-to-b ${feature.glowColor} bg-[var(--surface)]/90 backdrop-blur-xl shadow-xl transition-all duration-300 ${feature.borderColor} relative overflow-hidden flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="p-3 rounded-xl bg-[var(--surface-active)] border border-[var(--border-strong)] shadow-inner">
                      {feature.icon}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border ${feature.badgeColor}`}>
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2.5 group-hover:text-white transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[#CBD5E1] leading-relaxed mb-6">
                    {feature.desc}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#748FFC] group-hover:translate-x-1 transition-transform">
                  <span>Explore Documentation</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
