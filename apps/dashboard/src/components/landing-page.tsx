import Link from "next/link";
import { Card } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { env } from "#/lib/env";

const FEATURES = [
  { emoji: "🛡️", title: "Anti-Nuke & Wick Permits", desc: "Node-based permit trees that survive a compromised admin account." },
  { emoji: "🔊", title: "Temp Voice Channels", desc: "Join-to-create channels with per-generator templates and live ownership controls." },
  { emoji: "🚨", title: "Auto-Mod Heat Filters", desc: "Escalating warn thresholds — auto mute, kick, ban, or quarantine." },
  { emoji: "⚙️", title: "Granular Node Permits", desc: "Per-channel and per-role config overrides without touching code." },
  { emoji: "🧩", title: "Addon Marketplace", desc: "Install community modules from any Git repository, pinned per version." },
  { emoji: "📊", title: "Config History & Rollback", desc: "Every settings change is logged — one click to revert." },
] as const;

const COMPARISON = [
  ["100% Self-Hosted Free", true, false, false, true],
  ["Anti-Nuke Panic Mode", true, false, false, false],
  ["Temp VC Generator", true, false, false, false],
  ["Config Rollback", true, false, false, false],
] as const;

/** Public marketing landing page — dashboard.md §4. Served at `/` for anyone not signed in. */
export function LandingPage() {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.discordClientId}&permissions=8&scope=bot%20applications.commands`;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24">
      <section className="flex flex-col items-center py-20 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60">
          <span className="size-1.5 rounded-full bg-success" /> Lumi is
          online — self-hosted, always-on
        </span>
        <h1 className="font-brand max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="brand-gradient-text">Next-generation</span>{" "}
          Discord server governance
        </h1>
        <p className="mt-4 max-w-xl text-white/50">
          Modular · Anti-Nuke · Dynamic Voice · Permit-Based · Zero Latency
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={inviteUrl} target="_blank" rel="noreferrer">
            <Button size="default">🤖 Add Lumi to Discord</Button>
          </a>
          <Link href="/login">
            <Button variant="ghost">📊 Open Dashboard</Button>
          </Link>
          <a
            href="https://github.com/lumi-devs/Lumi/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="ghost">📜 Read the Docs</Button>
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <div className="mb-3 text-2xl">{f.emoji}</div>
            <h3 className="font-brand mb-1 font-semibold">{f.title}</h3>
            <p className="text-sm text-white/50">{f.desc}</p>
          </Card>
        ))}
      </section>

      <section className="mt-16 overflow-x-auto">
        <h2 className="font-brand mb-4 text-center text-xl font-bold">
          How Lumi compares
        </h2>
        <table className="w-full min-w-[500px] border-collapse overflow-hidden rounded-xl border border-border text-sm">
          <thead>
            <tr className="bg-white/5 text-left">
              <th className="p-3 font-medium text-white/60">Feature</th>
              <th className="p-3 font-medium text-white/60">Lumi</th>
              <th className="p-3 font-medium text-white/60">MEE6</th>
              <th className="p-3 font-medium text-white/60">Dyno</th>
              <th className="p-3 font-medium text-white/60">YAGPDB</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map(([feature, lumi, mee6, dyno, yagpdb]) => (
              <tr key={feature} className="border-t border-border">
                <td className="p-3">{feature}</td>
                <td className="p-3">{lumi ? "✅" : "❌"}</td>
                <td className="p-3">{mee6 ? "✅" : "❌"}</td>
                <td className="p-3">{dyno ? "✅" : "❌"}</td>
                <td className="p-3">{yagpdb ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
