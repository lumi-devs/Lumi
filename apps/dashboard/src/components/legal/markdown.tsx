import Link from "next/link";
import { Wordmark } from "#/components/layout/wordmark";

// Purpose-built for the two docs in .github/ (headers, hr, bold, links, flat
// bullet lists, hard line breaks) - not a general markdown renderer.
export function Markdown({ source }: { source: string }) {
  const blocks = toBlocks(source);
  return <div className="space-y-4 text-[17px] leading-7 text-fg">{blocks}</div>;
}

function toBlocks(source: string): React.ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(
      <p key={key++} className="text-fg-muted">
        {inline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={key++} className="list-disc space-y-1 pl-5 text-fg-muted">
        {list.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    const centeredTitle = line.match(/^<div[^>]*><h1>(.*)<\/h1><\/div>$/);
    if (centeredTitle) {
      flushParagraph();
      flushList();
      nodes.push(
        <div key={key++} className="mb-2 flex flex-col items-center gap-3 text-center">
          <Wordmark />
          <h1 className="font-display text-[25px] font-semibold tracking-[0.01em] text-fg">
            {centeredTitle[1]}
          </h1>
        </div>,
      );
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      nodes.push(<hr key={key++} className="border-border-soft" />);
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      flushParagraph();
      flushList();
      nodes.push(
        <h3 key={key++} className="font-display text-[18px] font-semibold text-fg">
          {inline(h3[1]!)}
        </h3>,
      );
      continue;
    }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      flushParagraph();
      flushList();
      const id = slugify(h2[1]!);
      nodes.push(
        <h2
          key={key++}
          id={id}
          className="font-display pt-2 text-[20px] font-semibold text-fg"
        >
          {inline(h2[1]!)}
        </h2>,
      );
      continue;
    }

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]!);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.replace(/\s{2,}$/, "\n"));
  }
  flushParagraph();
  flushList();

  return nodes;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Splits on **bold**, [text](href) and literal "\n" (hard line breaks from
// trailing double-spaces), left to right, preserving order.
function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\n)/g);
  return parts.map((part, i) => {
    if (part === "\n") return <br key={i} />;

    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, rawHref] = link;
      const href = resolveHref(rawHref!);
      if (href.startsWith("#") || href.startsWith("/legal/")) {
        return (
          <Link key={i} href={href} className="underline hover:text-fg">
            {label}
          </Link>
        );
      }
      return (
        <a
          key={i}
          href={href}
          className="underline hover:text-fg"
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>
      );
    }

    return part;
  });
}

// The source .md files link to each other and to LICENSE via relative repo
// paths, which don't resolve once rendered at /legal/*; point those at the
// in-app routes / the public GitHub blob instead.
function resolveHref(href: string): string {
  if (href.endsWith("PRIVACY_POLICY.md")) return "/legal/privacy";
  if (href.endsWith("TERMS_OF_SERVICE.md")) return "/legal/terms";
  if (href.endsWith("/LICENSE") || href === "LICENSE") {
    return "https://github.com/lumi-devs/Lumi/blob/main/LICENSE";
  }
  return href;
}
