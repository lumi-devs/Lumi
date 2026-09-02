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

  // Calculate estimated reading time
  const wordCount = doc.content ? doc.content.split(/\s+/).length : 500;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 220));

  const docSlug = resolvedParams.slug.join("/");
  const githubEditUrl = `https://github.com/lumi-devs/Lumi/blob/main/apps/docs/src/content/docs/${docSlug}.md`;

  return (
    <div className="mx-auto flex w-full max-w-[1700px] px-6 lg:px-10">
      <Sidebar />
      <main className="relative py-6 lg:gap-12 lg:py-8 xl:grid xl:grid-cols-[minmax(0,1fr)_260px] min-w-0 w-full flex-1">
        <div className="mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* Breadcrumb Trail & Reading Time Metadata */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fg-muted)] pb-4 border-b border-[var(--border)]">
            <div className="flex items-center space-x-1.5 font-mono">
              <Link href="/" className="hover:text-white transition-colors">
                Docs
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" />
              <span className="font-semibold text-white">{doc.meta.title}</span>
            </div>

            <div className="flex items-center gap-4 text-[11px] font-mono">
              <div className="flex items-center gap-1 text-[var(--fg-subtle)]">
                <Clock className="h-3.5 w-3.5" />
                <span>~{readTimeMin} min read</span>
              </div>
              <Link
                href={githubEditUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[var(--fg-subtle)] hover:text-[var(--accent)] transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit on GitHub</span>
              </Link>
            </div>
          </div>

          {/* Doc Heading Banner */}
          <div className="space-y-3 pb-6">
            <h1 className="scroll-m-20 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {doc.meta.title}
            </h1>
            {doc.meta.description && (
              <p className="text-base text-[var(--fg-muted)] leading-relaxed">{doc.meta.description}</p>
            )}
          </div>

          {/* Rendered HTML Content */}
          <div
            className="doc-content pb-12 pt-2 min-w-0 w-full"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          {/* Bottom Previous / Next Navigation Pager */}
          <hr className="border-[var(--border)] my-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-12">
            {doc.prev ? (
              <Link
                href={`/${encodeURI(doc.prev.slug)}`}
                className="group flex flex-col p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
              >
                <span className="text-xs font-semibold text-[var(--fg-subtle)] group-hover:text-[var(--accent)] flex items-center gap-1 mb-1 font-mono uppercase tracking-wider">
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous Chapter
                </span>
                <span className="text-sm font-bold text-white group-hover:text-[var(--accent)] transition-colors">
                  {doc.prev.title}
                </span>
              </Link>
            ) : <div />}

            {doc.next ? (
              <Link
                href={`/${encodeURI(doc.next.slug)}`}
                className="group flex flex-col items-end text-right p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
              >
                <span className="text-xs font-semibold text-[var(--fg-subtle)] group-hover:text-[var(--accent)] flex items-center gap-1 mb-1 font-mono uppercase tracking-wider">
                  Next Chapter <ChevronRight className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-bold text-white group-hover:text-[var(--accent)] transition-colors">
                  {doc.next.title}
                </span>
              </Link>
            ) : <div />}
          </div>
        </div>
        <TableOfContents toc={doc.toc} />
      </main>
    </div>
  );
}
