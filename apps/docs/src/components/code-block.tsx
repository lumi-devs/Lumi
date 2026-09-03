"use client";
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-6 overflow-hidden rounded-lg bg-[var(--bg)] border border-[var(--border)] shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        {language && <span className="text-xs text-[var(--fg-muted)] font-mono">{language}</span>}
      </div>
      <div className="p-4 overflow-x-auto text-sm text-[var(--fg)] font-mono">
        <pre><code>{code}</code></pre>
      </div>
      <button
        onClick={onCopy}
        className="absolute top-12 right-2 p-2 rounded-md bg-[var(--surface-active)] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity border border-[var(--border)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]"
      >
        {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
