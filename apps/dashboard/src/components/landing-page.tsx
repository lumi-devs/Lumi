import Link from "next/link";
import {
  BookText,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Siren,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "#/components/ui/button-variants";
import { CardBody } from "#/components/ui/card";
import { StatusDot } from "#/components/ui/badge";
import { Reveal } from "#/components/reveal";
import {
  HeroHeadline,
  MagneticCta,
  SpotlightBox,
  SpotlightCard,
} from "#/components/landing-motion";
import { env } from "#/lib/env";

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ShieldCheck,
    title: "Anti-nuke & granular permits",
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
    desc: "Escalating warn thresholds: auto mute, kick, ban, or quarantine.",
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
    desc: "Every settings change is logged. One click to revert.",
  },
];

const PREVIEW_MODULES: { label: string; active: boolean }[] = [
  { label: "Anti-nuke", active: true },
  { label: "Auto-moderation", active: true },
  { label: "Temp voice", active: true },
  { label: "Verification", active: false },
];

export function LandingPage() {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.discordClientId}&permissions=8&scope=bot%20applications.commands`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 md:px-6">
      <section className="hero-atmosphere grid gap-12 border-b border-border py-20 md:py-28 lg:grid-cols-[3fr_2fr] lg:items-center lg:gap-10">
        <Reveal>
          <p className="font-display text-[13px] font-semibold tracking-[0.16em] text-fg-subtle uppercase">
            Self-hosted Discord bot
          </p>

          <h1 className="font-display mt-3 max-w-xl text-6xl leading-[0.98] font-semibold tracking-tight text-fg sm:text-7xl lg:text-[5.5rem]">
            <HeroHeadline lines={["Moderation.", "Fully yours."]} />
          </h1>

          <p className="mt-6 max-w-md text-[17px] leading-6 text-fg-muted">
            Configure every module and permission from one place. No
            slash-command archaeology. No third party holding your data.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <MagneticCta
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Add to Discord
            </MagneticCta>
            <Link
              href="/login"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              <LayoutDashboard aria-hidden />
              Open dashboard
            </Link>
            <a
              href="https://lumi-devs.github.io/Lumi/"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "lg" })}
            >
              <BookText aria-hidden />
              Documentation
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <SpotlightCard className="shadow-e2 transition-[transform,box-shadow] duration-normal ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-glow-accent">
            <CardBody className="flex flex-col gap-3 p-3">
              <p className="font-display px-1 text-[13px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                Modules
              </p>
              <ul className="flex flex-col gap-1">
                {PREVIEW_MODULES.map((m) => (
                  <li
                    key={m.label}
                    className="flex items-center justify-between rounded-control border border-border-soft bg-bg-subtle px-3 py-2"
                  >
                    <span className="text-[15px] font-medium text-fg">
                      {m.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
                      <StatusDot active={m.active} />
                      {m.active ? "Active" : "Off"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </SpotlightCard>
        </Reveal>
      </section>

      <section className="py-16">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            What you get
          </h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 0.06}>
              <SpotlightBox className="flex gap-3.5 rounded-panel p-2 -m-2">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface text-fg-muted transition-[transform,color,border-color] duration-fast ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-border-strong hover:text-accent-fg">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-[17px] font-semibold tracking-[0.005em] text-fg">
                    {title}
                  </h3>
                  <p className="mt-0.5 text-[15px] leading-5 text-fg-muted">
                    {desc}
                  </p>
                </div>
              </SpotlightBox>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}
