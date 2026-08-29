import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

export interface DocMeta {
  title: string;
  description?: string;
  category?: string;
  slug: string;
}

export interface TocHeading {
  depth: number;
  text: string;
  id: string;
}

export interface DocContent {
  meta: DocMeta;
  content: string;
  html: string;
  toc: TocHeading[];
  prev?: DocMeta;
  next?: DocMeta;
}

const getSlugsFromDir = (dir: string, baseDir: string): string[] => {
  let slugs: string[] = [];
  if (!fs.existsSync(dir)) return slugs;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      slugs = slugs.concat(getSlugsFromDir(fullPath, baseDir));
    } else if (file.endsWith(".md") || file.endsWith(".mdx")) {
      const relPath = path.relative(baseDir, fullPath);
      slugs.push(relPath.replace(/\.mdx?$/, ""));
    }
  }
  return slugs;
};

export const getAllDocs = (): DocMeta[] => {
  const slugs = getSlugsFromDir(DOCS_DIR, DOCS_DIR);
  return slugs.map((slug) => {
    const fullPath = path.join(DOCS_DIR, `${slug}.md`);
    const fullPathX = path.join(DOCS_DIR, `${slug}.mdx`);
    let fileContents = "";
    if (fs.existsSync(fullPath)) {
      fileContents = fs.readFileSync(fullPath, "utf8");
    } else if (fs.existsSync(fullPathX)) {
      fileContents = fs.readFileSync(fullPathX, "utf8");
    } else {
      return { title: slug, slug };
    }
    const { data } = matter(fileContents);
    return {
      title: data.title || slug,
      description: data.description,
      category: data.category,
      slug,
    };
  });
};

export const getDocBySlug = (slugArray: string[]): DocContent | null => {
  const slug = slugArray.join("/");
  const fullPath = path.join(DOCS_DIR, `${slug}.md`);
  const fullPathX = path.join(DOCS_DIR, `${slug}.mdx`);
  let fileContents = "";
  if (fs.existsSync(fullPath)) {
    fileContents = fs.readFileSync(fullPath, "utf8");
  } else if (fs.existsSync(fullPathX)) {
    fileContents = fs.readFileSync(fullPathX, "utf8");
  } else {
    return null;
  }

  const { data, content } = matter(fileContents);
  
  // Extract TOC
  const toc: TocHeading[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const depth = match?.[1]?.length || 2;
      const text = match?.[2]?.trim() || '';
      const id = text.toLowerCase().replace(/[^\w]+/g, "-");
      toc.push({ depth, text, id });
    }
  }

  // Parse HTML
  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }) => {
    const plainText = text.replace(/<[^>]*>/g, "").trim();
    const id = plainText.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    return `<h${depth} id="${id}" class="group flex items-center gap-2"><span>${text}</span><a href="#${id}" class="opacity-0 group-hover:opacity-100 text-[var(--fg-subtle)] hover:text-[var(--accent)] transition-opacity text-sm ml-1">#</a></h${depth}>`;
  };

  renderer.code = ({ text, lang }) => {
    const language = lang || "text";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    return `<div class="my-6 rounded-xl overflow-hidden border border-[var(--border-strong)] bg-[#0A0D14] shadow-lg">
      <div class="flex items-center justify-between px-4 py-2 bg-[var(--surface-active)] border-b border-[var(--border-strong)] text-xs font-mono text-[var(--fg-muted)]">
        <div class="flex items-center gap-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80"></span>
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80"></span>
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#27C93F]/80"></span>
          <span class="ml-2 font-medium uppercase tracking-wider text-[11px] text-[var(--fg-subtle)]">${language}</span>
        </div>
      </div>
      <pre class="p-4 overflow-x-auto text-[13px] leading-relaxed text-[#E2E8F0] font-mono"><code>${escaped}</code></pre>
    </div>`;
  };
  
  const html = marked(content, { renderer }) as string;

  const allDocs = getAllDocs();
  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const prev = currentIndex > 0 ? allDocs[currentIndex - 1] : undefined;
  const next = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : undefined;

  return {
    meta: {
      title: data.title || slug,
      description: data.description,
      category: data.category,
      slug,
    },
    content,
    html,
    toc,
    prev,
    next,
  };
};
