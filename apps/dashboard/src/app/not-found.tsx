import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-brand text-3xl font-bold">
        <span className="brand-gradient-text">404</span>
      </p>
      <p className="text-white/50">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="text-sm font-medium text-accent-cyan hover:underline">
        ← Back to Lumi
      </Link>
    </main>
  );
}
