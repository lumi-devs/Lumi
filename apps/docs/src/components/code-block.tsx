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
    <div className="relative group my-6 overflow-hidden rounded-lg bg-[#0d1117] border border-[#30363d]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        {language && <span className="text-xs text-[#8b949e] font-mono">{language}</span>}
      </div>
      <div className="p-4 overflow-x-auto text-sm text-[#e6edf3] font-mono">
        <pre><code>{code}</code></pre>
      </div>
      <button
        onClick={onCopy}
        className="absolute top-12 right-2 p-2 rounded-md bg-[#21262d] text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity border border-[#30363d] hover:text-[#c9d1d9] hover:bg-[#30363d]"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
