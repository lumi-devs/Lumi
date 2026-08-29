import { notFound } from "next/navigation";
import { getDocBySlug, getAllDocs } from "@/lib/docs";
import { Sidebar } from "@/components/sidebar";
import { TableOfContents } from "@/components/toc";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

export async function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({
    slug: doc.slug.split("/"),
  }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params;
  const doc = getDocBySlug(resolvedParams.slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-7xl px-6 lg:px-8">
      <Sidebar />
      <main className="relative py-6 lg:gap-10 lg:py-8 xl:grid xl:grid-cols-[1fr_250px] min-w-0 w-full flex-1">
        <div className="mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-4 flex items-center space-x-1 text-sm text-[var(--fg-muted)]">
            <span className="truncate">Docs</span>
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium text-[var(--fg)]">{doc.meta.title}</span>
          </div>
          <div className="space-y-2">
            <h1 className="scroll-m-20 text-4xl font-bold tracking-tight text-[var(--fg)]">
              {doc.meta.title}
            </h1>
            {doc.meta.description && (
              <p className="text-lg text-[var(--fg-muted)]">{doc.meta.description}</p>
            )}
          </div>
          <div
            className="pb-12 pt-8 prose prose-invert max-w-none prose-headings:scroll-m-20 prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline prose-pre:bg-[var(--surface-active)] prose-pre:border prose-pre:border-[var(--border-strong)] prose-img:rounded-xl prose-img:border prose-img:border-[var(--border)]"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
          <hr className="border-[var(--border)] my-8" />
          <div className="flex flex-row items-center justify-between">
            {doc.prev ? (
              <Link href={`/${doc.prev.slug}`} className="group flex flex-col items-start gap-1 rounded-lg border border-[var(--border)] p-4 hover:border-[var(--accent)] transition-colors">
                <span className="text-xs font-medium text-[var(--fg-muted)] flex items-center gap-1">
                  <ChevronLeft className="h-3 w-3" /> Previous
                </span>
                <span className="font-medium text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">{doc.prev.title}</span>
              </Link>
            ) : <div />}
            {doc.next ? (
              <Link href={`/${doc.next.slug}`} className="group flex flex-col items-end gap-1 rounded-lg border border-[var(--border)] p-4 hover:border-[var(--accent)] transition-colors text-right">
                <span className="text-xs font-medium text-[var(--fg-muted)] flex items-center gap-1">
                  Next <ChevronRight className="h-3 w-3" />
                </span>
                <span className="font-medium text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">{doc.next.title}</span>
              </Link>
            ) : <div />}
          </div>
        </div>
        <TableOfContents toc={doc.toc} />
      </main>
    </div>
  );
}
