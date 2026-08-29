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
  // We need to inject ids into headings for TOC
  const renderer = new marked.Renderer();
  renderer.heading = ({text, depth}) => {
    const id = text.toLowerCase().replace(/[^\w]+/g, "-");
    return `<h${depth} id="${id}">${text}</h${depth}>`;
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
