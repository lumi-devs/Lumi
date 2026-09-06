import { notFound } from "next/navigation";
import { getDocBySlug, getAllDocs } from "@/lib/docs";
import { Sidebar } from "@/components/sidebar";
import { TableOfContents } from "@/components/toc";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Clock, Edit3 } from "lucide-react";

export function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({
    slug: doc.slug.split("/"),
  }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params;
  const doc = await getDocBySlug(resolvedParams.slug);

  if (!doc) {
    notFound();
  }

  const wordCount = doc.content ? doc.content.split(/\s+/).length : 500;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 220));

  const docSlug = resolvedParams.slug.join("/");
  const githubEditUrl = `https://github.com/lumi-devs/Lumi/blob/main/apps/docs/src/content/docs/${docSlug}.md`;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
      <Sidebar />

      <main className="relative py-8 min-w-0 w-full flex-1 flex justify-between gap-10 xl:gap-14 md:pl-10 lg:pl-14">
        <div className="w-full max-w-[780px] min-w-0 mx-auto lg:mx-0">
          {/* Breadcrumbs & Metadata Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)] pb-3">
            <div className="flex items-center space-x-1.5 font-mono">
              <Link href="/" className="hover:text-white transition-colors">
                Docs
              </Link>
              <ChevronRight className="h-3 w-3 text-[var(--fg-subtle)]" />
              {doc.meta.category && (
                <>
                  <span className="text-[var(--fg-subtle)]">{doc.meta.category}</span>
                  <ChevronRight className="h-3 w-3 text-[var(--fg-subtle)]" />
                </>
              )}
              <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-none">
                {doc.meta.title}
              </span>
            </div>

            <Link
              href={githubEditUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--fg-subtle)] hover:text-[var(--accent-fg)] transition-colors"
            >
              <Edit3 className="h-3 w-3" />
              <span>Edit page</span>
            </Link>
          </div>

          {/* Document Header */}
          <div className="space-y-3 pb-6 mb-6 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-fg)] border border-[var(--accent-border)] font-mono text-[10px] font-semibold uppercase tracking-wider">
                {doc.meta.category || "Documentation"}
              </span>
              <span className="text-[var(--fg-subtle)] text-[11px] flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {readTimeMin} min read
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-[var(--font-heading)]">
              {doc.meta.title}
            </h1>

            {doc.meta.description && (
              <p className="text-base text-[var(--fg-muted)] leading-relaxed pt-1">
                {doc.meta.description}
              </p>
            )}
          </div>

          {/* Rendered Document Body */}
          <div
            className="doc-content pb-12 min-w-0 w-full"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          <hr className="border-[var(--border)] my-10" />

          {/* Previous / Next Navigation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-16">
            {doc.prev ? (
              <Link
                href={`/${encodeURI(doc.prev.slug)}/`}
                className="group flex flex-col p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
              >
                <span className="text-[11px] font-mono text-[var(--fg-subtle)] flex items-center gap-1 group-hover:text-[var(--accent-fg)] transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                  <span>Previous</span>
                </span>
                <span className="font-semibold text-sm text-[var(--fg)] mt-1 group-hover:text-white">
                  {doc.prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}

            {doc.next ? (
              <Link
                href={`/${encodeURI(doc.next.slug)}/`}
                className="group flex flex-col items-end text-right p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
              >
                <span className="text-[11px] font-mono text-[var(--fg-subtle)] flex items-center gap-1 group-hover:text-[var(--accent-fg)] transition-colors">
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
                <span className="font-semibold text-sm text-[var(--fg)] mt-1 group-hover:text-white">
                  {doc.next.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>

        {/* Right Table of Contents */}
        <TableOfContents toc={doc.toc} />
      </main>
    </div>
  );
}
