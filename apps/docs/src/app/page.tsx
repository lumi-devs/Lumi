"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { DiscordCardPreview } from "@/components/discord-card-preview";

export default function Home() {
  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Animated glowing radial gradient backdrop */}
      <div className="absolute inset-x-0 top-0 -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[-20rem]" aria-hidden="true">
        <motion.div
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="relative left-1/2 -z-10 aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#4C6EF5] to-[#12B886] opacity-30 sm:left-[calc(50%-40rem)] sm:w-[72.1875rem]"
          style={{ clipPath: "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)" }}
        />
      </div>

      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-24 pt-10 sm:pb-32 lg:flex lg:py-40">
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0 lg:pt-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="mt-10 text-4xl font-bold tracking-tight text-[var(--fg)] sm:text-6xl">
              The Modular Discord Framework Built for Control
            </h1>
            <p className="mt-6 text-lg leading-8 text-[var(--fg-muted)]">
              Build robust, scalable, and beautifully designed Discord applications with our zero-leak addon SDK and Next.js admin panel.
            </p>
            <div className="mt-10 flex items-center gap-x-6">
              <Link
                href="/guides/self-hosting"
                className="rounded-md bg-[var(--accent)] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-colors"
              >
                Get Started
              </Link>
              <Link href="/architecture" className="text-sm font-semibold leading-6 text-[var(--fg)] hover:text-[var(--accent)] transition-colors">
                Read Architecture <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="mt-10">
              <div className="glass rounded-lg border border-[var(--border)] p-4 flex items-center justify-between">
                <code className="text-sm text-[var(--fg-subtle)] font-mono">bun create @lumi/app my-bot</code>
                <button className="text-[var(--fg-muted)] hover:text-[var(--fg)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
        <div className="mx-auto mt-16 flex max-w-2xl sm:mt-24 lg:ml-10 lg:mr-0 lg:mt-0 lg:max-w-none lg:flex-none xl:ml-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-3xl flex-none sm:max-w-5xl lg:max-w-none"
          >
            <DiscordCardPreview />
          </motion.div>
        </div>
      </div>
      
      {/* 4-Quadrant Feature Bento Grid */}
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: "Modular Architecture", desc: "Build components in isolation, hot-reload on the fly." },
            { title: "Zero-Leak Addon SDK", desc: "Strict module boundaries keep your memory footprint pristine." },
            { title: "Next.js Admin Panel", desc: "Manage everything via a beautiful web dashboard." },
            { title: "Full GDPR Engine", desc: "Built-in compliance tools to automatically handle user data requests." }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass p-6 rounded-2xl border border-[var(--border-strong)] hover:border-[var(--accent)] transition-colors"
            >
              <h3 className="text-xl font-semibold text-[var(--fg)] mb-2">{feature.title}</h3>
              <p className="text-[var(--fg-muted)]">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
