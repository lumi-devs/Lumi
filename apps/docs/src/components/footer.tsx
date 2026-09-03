import Link from "next/link";
import { BookOpen, ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg-muted)] text-sm mt-20">
      <div className="mx-auto max-w-[1700px] px-6 lg:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[var(--fg)] font-semibold">
              <BookOpen className="h-5 w-5 text-[var(--accent)]" />
              <span>Lumi Framework</span>
            </div>
            <p className="text-xs text-[var(--fg-subtle)] leading-relaxed">
              Modular, self-hosted Discord bot built on Bun, Sapphire, Prisma, and Next.js.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
              <ShieldCheck className="h-4 w-4 text-[var(--success)]" />
              <span>GPL-3.0 Licensed • Privacy-First</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] mb-3">Documentation</h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/guides/self-hosting" className="hover:text-[var(--fg)] transition-colors">Self-Hosting Guide</Link></li>
              <li><Link href="/architecture" className="hover:text-[var(--fg)] transition-colors">System Architecture</Link></li>
              <li><Link href="/guides/module-creation" className="hover:text-[var(--fg)] transition-colors">Module Creation</Link></li>
              <li><Link href="/dashboard" className="hover:text-[var(--fg)] transition-colors">Web Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] mb-3">Governance & Privacy</h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-[var(--fg)] transition-colors">Data Privacy & GDPR</Link></li>
              <li><Link href="/license" className="hover:text-[var(--fg)] transition-colors">License (GPL-3.0)</Link></li>
              <li><Link href="/faq" className="hover:text-[var(--fg)] transition-colors">Frequently Asked Questions</Link></li>
              <li><Link href="/troubleshooting" className="hover:text-[var(--fg)] transition-colors">Troubleshooting</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg)] mb-3">Community & Source</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="https://github.com/lumi-devs/Lumi" target="_blank" rel="noreferrer" className="hover:text-[var(--fg)] transition-colors">GitHub Repository</a></li>
              <li><a href="https://discord.gg" target="_blank" rel="noreferrer" className="hover:text-[var(--fg)] transition-colors">Discord Community</a></li>
              <li><a href="https://github.com/lumi-devs/Lumi/releases" target="_blank" rel="noreferrer" className="hover:text-[var(--fg)] transition-colors">Releases & Changelog</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--border)] mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[var(--fg-subtle)] gap-4">
          <p>© {new Date().getFullYear()} Lumi Developers. Free and open source under GPL-3.0.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[var(--fg)] transition-colors">Privacy</Link>
            <span>•</span>
            <Link href="/license" className="hover:text-[var(--fg)] transition-colors">License</Link>
            <span>•</span>
            <a href="https://github.com/lumi-devs/Lumi" target="_blank" rel="noreferrer" className="hover:text-[var(--fg)] transition-colors">Source</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
