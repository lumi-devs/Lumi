import Link from "next/link";

export default function NotFound() {
  return (
    <div className="doc-shell mx-auto max-w-xl py-16 text-center">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--accent-strong)" }}>
        404
      </p>
      <h1 className="mt-3">Page not found</h1>
      <p style={{ color: "var(--fg-muted)" }}>
        That page does not exist in this version of the docs.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg px-5 py-2.5 text-[14px] font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Back to the docs home
      </Link>
    </div>
  );
}
