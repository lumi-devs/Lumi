"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { DiscordCardPreview } from "@/components/discord-card-preview";
import { MathCanvas } from "@/components/math-canvas";
import { Copy, Check, Cpu, ShieldCheck, LayoutDashboard, Layers, Sparkles, ArrowRight, Activity } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"setup" | "addon" | "docker">("setup");
  const [copied, setCopied] = useState(false);

  const snippets = {
    setup: "git clone https://github.com/lumi-devs/Lumi.git\ncd Lumi\nbun run setup",
    addon: "bun run addon:create my-addon --dir ./addons",
    docker: "docker compose up -d",
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

      {/* Hero Section */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-20 pt-12 lg:flex lg:py-28 items-center justify-between gap-12">
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
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/architecture"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]/80 px-6 py-3.5 text-sm font-semibold text-[#F8FAFC] backdrop-blur-md hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] transition-all cursor-pointer"
              >
                <span>Read Architecture</span>
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
                      onClick={() => setActiveTab("setup")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        activeTab === "setup"
                          ? "bg-[var(--surface)] text-white border border-[var(--border-strong)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-white"
                      }`}
                    >
                      Setup Wizard
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
                    <button
                      onClick={() => setActiveTab("docker")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        activeTab === "docker"
                          ? "bg-[var(--surface)] text-white border border-[var(--border-strong)] shadow-sm"
                          : "text-[var(--fg-muted)] hover:text-white"
                      }`}
                    >
                      Docker Compose
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
                  <Activity className="h-4 w-4 text-[#12B886]" />
                  <span className="font-semibold text-white">Live Discord Component Simulator</span>
                </div>
                <span className="font-mono text-[11px] bg-[var(--surface-active)] px-2 py-0.5 rounded border border-[var(--border)]">#cards.js</span>
              </div>
              <DiscordCardPreview />
            </div>
          </motion.div>
        </div>
      </div>

      {/* 4-Quadrant Feature Bento Grid */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-28 pt-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs text-[#748FFC] font-semibold mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Core Capabilities
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Engineered for Sovereign Scaling
          </h2>
          <p className="mt-3 text-sm text-[var(--fg-muted)]">
            Everything required to run resilient, compliant, multi-guild Discord infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              icon: <Layers className="h-6 w-6 text-[#748FFC]" />,
              title: "Modular Addon SDK",
              desc: "Isolate features into independent submodules. Zero cross-module leaks, unified @DefineModule lifecycle, and typed runtime config schemas."
            },
            {
              icon: <Cpu className="h-6 w-6 text-[#20C997]" />,
              title: "Distributed Sharding & Event Bus",
              desc: "discord.js child process sharding coordinated with Redis Streams for synchronized scheduled tasks and cluster event dispatch."
            },
            {
              icon: <LayoutDashboard className="h-6 w-6 text-[#FB923C]" />,
              title: "Next.js 16 Admin Panel",
              desc: "Web control panel communicating over an internal 66-action HTTP RPC bridge. Zero bot token or database exposure to the dashboard frontend."
            },
            {
              icon: <ShieldCheck className="h-6 w-6 text-[#F472B6]" />,
              title: "GDPR & Privacy Governance",
              desc: "Automated 90-day/365-day data retention sweeps, mandatory manifest privacy disclosures, and universal deleteUserData erasure hooks."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass p-8 rounded-2xl border border-[var(--border-strong)] hover:border-[var(--accent)] hover:shadow-2xl hover:shadow-[#4C6EF5]/10 transition-all group relative overflow-hidden"
            >
              <div className="mb-4 inline-block p-3 rounded-xl bg-[var(--surface-active)] border border-[var(--border-strong)]">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-[#748FFC] transition-colors">{feature.title}</h3>
              <p className="text-sm text-[#CBD5E1] leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
