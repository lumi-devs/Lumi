import Link from "next/link";
import {
  BookText,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Siren,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "#/components/ui/button";
import { env } from "#/lib/env";

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ShieldCheck,
    title: "Anti-nuke & Wick permits",
    desc: "Node-based permit trees that survive a compromised admin account.",
  },
  {
    icon: Volume2,
    title: "Temp voice channels",
    desc: "Join-to-create channels with per-generator templates and live ownership controls.",
  },
  {
    icon: Siren,
    title: "Auto-mod heat filters",
    desc: "Escalating warn thresholds — auto mute, kick, ban, or quarantine.",
  },
  {
    icon: KeyRound,
    title: "Granular node permits",
    desc: "Per-channel and per-role config overrides without touching code.",
  },
  {
    icon: Package,
    title: "Addon repositories",
    desc: "Install community modules from any Git repository, pinned per version.",
  },
  {
    icon: History,
    title: "Config history & rollback",
    desc: "Every settings change is logged — one click to revert.",
  },
];

/**
 * Public landing page — dashboard.md §4. Served at `/` for anyone not signed in.
 *
 * Deliberately restrained: this is the front door of a self-hosted admin tool,
 * so it previews the product rather than performing at the reader. Removed in
 * this pass: the centred gradient-text hero, the emoji-per-feature card grid,
 * and the ✅/❌ "how Lumi compares to MEE6/Dyno/YAGPDB" table — competitor
 * checkmark tables are marketing furniture that no self-hosted admin panel
 * needs, and emoji ticks in a table are a strong template tell.
 */
export function LandingPage() {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.discordClientId}&permissions=8&scope=bot%20applications.commands`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 md:px-6">
      <section className="border-b border-border py-16 md:py-20">
        <span className="font-display inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold tracking-[0.09em] text-fg-muted uppercase">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Self-hosted · always on
        </span>

        <h1 className="font-display mt-5 max-w-2xl text-4xl leading-[1.08] font-semibold tracking-[0.005em] text-fg sm:text-5xl">
          Next-generation Discord server governance
        </h1>

        <p className="mt-3 max-w-xl text-[14px] leading-6 text-fg-muted">
          Lumi is a modular moderation bot you run yourself. Configure every
          module, permit and threshold from one panel — no slash-command
          archaeology, no third party holding your data.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Add Lumi to Discord
          </a>
          <Link
            href="/login"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            <LayoutDashboard aria-hidden />
            Open dashboard
          </Link>
          <a
            href="https://github.com/lumi-devs/Lumi/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            <BookText aria-hidden />
            Documentation
          </a>
        </div>
      </section>

      <section className="py-12">
        <h2 className="font-display text-[12px] font-semibold tracking-[0.11em] text-fg-subtle uppercase">
          What you get
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-fg-muted">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-[14px] font-semibold tracking-[0.01em] text-fg">
                  {title}
                </h3>
                <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4">
        <SlidersHorizontal className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
          Already running Lumi? Sign in with Discord to manage any server where
          you have <span className="text-fg">Manage Server</span>.
        </p>
        <Link
          href="/login"
          className={buttonVariants({ variant: "secondary", size: "md" })}
        >
          Continue
        </Link>
      </section>
    </main>
  );
}
