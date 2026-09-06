import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked, Renderer } from "marked";
import Prism from "prismjs";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-docker.js";
import { getAdjacentDocs } from "./navigation";

const DocsDir = path.join(process.cwd(), "src/content/docs");
const DocsDirResolved = path.resolve(DocsDir);

const isContainedInDocsDir = (candidatePath: string): boolean => {
  const resolved = path.resolve(candidatePath);
  return resolved.startsWith(DocsDirResolved + path.sep);
};

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
  const slugs = getSlugsFromDir(DocsDir, DocsDir);
  return slugs.map((slug) => {
    const fullPath = path.join(DocsDir, `${slug}.md`);
    const fullPathX = path.join(DocsDir, `${slug}.mdx`);
    let fileContents = "";
    if (isContainedInDocsDir(fullPath) && fs.existsSync(fullPath)) {
      fileContents = fs.readFileSync(fullPath, "utf8");
    } else if (isContainedInDocsDir(fullPathX) && fs.existsSync(fullPathX)) {
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

export const getDocBySlug = async (slugArray: string[]): Promise<DocContent | null> => {
  const slug = slugArray.join("/");
  const fullPath = path.join(DocsDir, `${slug}.md`);
  const fullPathX = path.join(DocsDir, `${slug}.mdx`);
  let fileContents = "";
  if (isContainedInDocsDir(fullPath) && fs.existsSync(fullPath)) {
    fileContents = fs.readFileSync(fullPath, "utf8");
  } else if (isContainedInDocsDir(fullPathX) && fs.existsSync(fullPathX)) {
    fileContents = fs.readFileSync(fullPathX, "utf8");
  } else {
    return null;
  }

  const { data, content } = matter(fileContents);

  const createHeadingSlug = (raw: string): string => {
    return raw
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[`'"]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  };

  const toc: TocHeading[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const depth = match?.[1]?.length || 2;
      const text = match?.[2]?.trim() || '';
      const id = createHeadingSlug(text);
      toc.push({ depth, text, id });
    }
  }

  const renderer = new Renderer();
  renderer.heading = ({ text, depth }) => {
    if (depth === 1) {
      // Suppress duplicate H1 in body because the page header already displays it
      return "";
    }
    const id = createHeadingSlug(text);
    return `<h${depth} id="${id}" class="group flex items-center gap-2"><span>${text}</span><a href="#${id}" class="opacity-0 group-hover:opacity-100 text-[var(--fg-subtle)] hover:text-[var(--accent)] transition-opacity text-sm ml-1">#</a></h${depth}>`;
  };

  renderer.blockquote = ({ text }) => {
    let type = "note";
    let clean = text.trim();
    if (clean.includes("[!NOTE]")) {
      type = "note";
      clean = clean.replace(/\[!NOTE\]/g, "");
    } else if (clean.includes("[!TIP]")) {
      type = "tip";
      clean = clean.replace(/\[!TIP\]/g, "");
    } else if (clean.includes("[!WARNING]")) {
      type = "warning";
      clean = clean.replace(/\[!WARNING\]/g, "");
    } else if (clean.includes("[!DANGER]")) {
      type = "danger";
      clean = clean.replace(/\[!DANGER\]/g, "");
    }
    return `<div class="callout callout-${type}">${clean}</div>`;
  };

  renderer.code = ({ text, lang }) => {
    const language = (lang || "text").toLowerCase().trim();
    let highlighted = "";

    let prismLang = language;
    if (prismLang === "ts" || prismLang === "tsx") prismLang = "typescript";
    else if (prismLang === "js" || prismLang === "jsx") prismLang = "javascript";
    else if (prismLang === "sh" || prismLang === "shell" || prismLang === "zsh") prismLang = "bash";
    else if (prismLang === "yml") prismLang = "yaml";
    else if (prismLang === "dockerfile") prismLang = "docker";

    const grammar = Prism.languages[prismLang];
    if (grammar) {
      try {
        highlighted = Prism.highlight(text, grammar, prismLang);
      } catch {
        highlighted = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
    } else {
      highlighted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const encodedCode = Buffer.from(text).toString("base64");

    return `<div class="code-block-wrapper my-6 rounded-xl overflow-hidden border border-[var(--border)] bg-[#07090f] shadow-lg">
      <div class="flex items-center justify-between px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] text-xs font-mono">
        <div class="flex items-center gap-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#FF5F56]/70"></span>
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/70"></span>
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#27C93F]/70"></span>
          <span class="ml-2 font-medium uppercase tracking-wider text-[11px] text-[var(--accent-fg)]">${language}</span>
        </div>
        <button
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-[var(--fg-muted)] hover:text-white rounded bg-[var(--surface-active)] border border-[var(--border)] transition-all cursor-pointer"
          onclick="navigator.clipboard.writeText(atob('${encodedCode}')).then(()=>{this.innerText='✓ Copied'; setTimeout(()=>{this.innerText='Copy'}, 2000)});"
        >
          Copy
        </button>
      </div>
      <pre class="p-4 overflow-x-auto text-[13px] leading-relaxed text-[#E2E8F0] font-mono"><code class="language-${prismLang}">${highlighted}</code></pre>
    </div>`;
  };

  marked.use({ renderer });
  const rawHtml = await marked(content);
  // Wrap all tables in an auto-scrolling container
  const html = rawHtml.replace(/<table>/g, '<div class="table-wrapper"><table>').replace(/<\/table>/g, '</table></div>');

  const { prev, next } = getAdjacentDocs(slug);

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
