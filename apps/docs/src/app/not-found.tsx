import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-7xl px-6 lg:px-8">
      <Sidebar />
      <main className="flex-1 py-12 flex flex-col items-center justify-center min-h-[50vh]">
        <h1 className="text-8xl font-bold text-[var(--fg)] tracking-tighter">404</h1>
        <p className="mt-4 text-xl text-[var(--fg-muted)]">Page not found</p>
        <p className="mt-2 text-sm text-[var(--fg-subtle)] text-center max-w-md mb-8">
          The documentation page you are looking for doesn't exist or has been moved.
        </p>
        <Link 
          href="/" 
          className="rounded-md bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-hover)] transition-colors"
        >
          Return to Home
        </Link>
      </main>
    </div>
  );
}
