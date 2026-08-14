import type { Metadata } from "next";
import { Markdown } from "#/components/legal/markdown";
import { readLegalDoc } from "#/lib/legal-docs";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsOfServicePage() {
  const doc = await readLegalDoc("TERMS_OF_SERVICE.md");

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-panel border border-border bg-surface p-6 shadow-e2">
        <Markdown source={doc} />
      </div>
    </main>
  );
}
