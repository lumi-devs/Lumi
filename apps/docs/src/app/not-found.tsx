import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--accent-strong)" }}>
        404
      </p>
      <h1 className="mt-3 text-2xl font-bold" style={{ color: "var(--fg)" }}>
        Page not found
      </h1>
      <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
        That page does not exist in this version of the docs.
      </p>
      <Link
        href="/docs"
        className="mt-6 inline-block rounded-lg px-5 py-2.5 text-[14px] font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Back to the docs
      </Link>
    </div>
  );
}
