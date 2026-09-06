"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language = "bash", title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="mt-5 overflow-hidden rounded-[10px] border"
      style={{ borderColor: "var(--border)", background: "#0d1119" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--border-soft)", background: "var(--bg-raise)" }}
      >
        <span
          className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]"
          style={{ color: "var(--fg-muted)" }}
        >
          {title ?? language}
        </span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors"
          style={{
            borderColor: "var(--border)",
            color: copied ? "var(--good)" : "var(--fg-muted)",
          }}
          aria-label="Copy code to clipboard"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed" style={{ color: "#dbe2f1" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
