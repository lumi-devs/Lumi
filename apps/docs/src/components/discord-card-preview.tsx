"use client";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Shield, Sliders, Sparkles } from "lucide-react";
import clsx from "clsx";

export type CardType = "success" | "warning" | "error" | "moderation" | "panel";

export function DiscordCardPreview() {
  const [activeType, setActiveType] = useState<CardType>("success");
  const [reactions, setReactions] = useState<{ [key: string]: number }>({
    "🔥": 12,
    "🚀": 8,
    "✨": 5,
  });
  const [userReacted, setUserReacted] = useState<{ [key: string]: boolean }>({});

  const handleReact = (emoji: string) => {
    setUserReacted((prev) => ({ ...prev, [emoji]: !prev[emoji] }));
    setReactions((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + (userReacted[emoji] ? -1 : 1),
    }));
  };

  return (
    <div className="w-full space-y-4">
      {/* Interactive Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveType("success")}
          className={clsx(
            "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
            activeType === "success"
              ? "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/40"
              : "bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]"
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Success Card</span>
        </button>

        <button
          onClick={() => setActiveType("moderation")}
          className={clsx(
            "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
            activeType === "moderation"
              ? "bg-[var(--accent-soft)] text-[var(--accent-fg)] border border-[var(--accent-border)]"
              : "bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]"
          )}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Mod Log Case</span>
        </button>

        <button
          onClick={() => setActiveType("panel")}
          className={clsx(
            "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
            activeType === "panel"
              ? "bg-[#FB923C]/20 text-[#FB923C] border border-[#FB923C]/40"
              : "bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]"
          )}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Panel UI</span>
        </button>

        <button
          onClick={() => setActiveType("warning")}
          className={clsx(
            "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
            activeType === "warning"
              ? "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/40"
              : "bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Warning</span>
        </button>

        <button
          onClick={() => setActiveType("error")}
          className={clsx(
            "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
            activeType === "error"
              ? "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/40"
              : "bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] border border-[var(--border)]"
          )}
        >
          <XCircle className="h-3.5 w-3.5" />
          <span>Error Card</span>
        </button>
      </div>

      {/* Discord Message Shell */}
      <div className="bg-[#313338] text-[#DBDEE1] rounded-2xl p-5 font-sans text-sm w-full border border-[#1E1F22] shadow-2xl transition-all">
        <div className="flex gap-3.5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#4C6EF5] to-[#12B886] flex items-center justify-center shrink-0 shadow-md">
            <span className="text-white font-bold text-sm tracking-wider">L</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="font-semibold text-white hover:underline cursor-pointer">Lumi</span>
              <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded font-bold tracking-wide flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20l-6-6 1.41-1.41L10 17.17l10-10L21.41 8 10 20z" />
                </svg>
                BOT
              </span>
              <span className="text-[#949BA4] text-xs">Today at 12:42 PM</span>
            </div>

            {/* Render Selected Card Type */}
            {activeType === "success" && (
              <div className="bg-[#2B2D31] rounded-lg flex flex-col border-l-4 border-[#12B886] p-4 my-2 transition-all">
                <div className="flex items-center gap-2 font-semibold text-white mb-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#12B886]" />
                  <span>Module Deployed Successfully</span>
                </div>
                <div className="text-xs text-[#DBDEE1] leading-relaxed">
                  Addon <code className="bg-[#1E1F22] text-[#A5D8FF] px-1.5 py-0.5 rounded font-mono">tag-manager</code> hot-reloaded across all 16 shards in 4.2ms with zero gateway disruption.
                </div>
              </div>
            )}

            {activeType === "moderation" && (
              <div className="bg-[#2B2D31] rounded-lg flex flex-col border-l-4 border-[#4C6EF5] p-4 my-2 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Shield className="h-4 w-4 text-[#748FFC]" />
                    <span>Case #1048 • Member Timeout</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#949BA4] bg-[#1E1F22] px-2 py-0.5 rounded">mod.mute</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3 text-[#DBDEE1]">
                  <div>
                    <span className="text-[#949BA4] block text-[11px]">Target:</span>
                    <span className="font-medium text-white">@username (ID: 98124...)</span>
                  </div>
                  <div>
                    <span className="text-[#949BA4] block text-[11px]">Moderator:</span>
                    <span className="font-medium text-white">@SecurityBot</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#949BA4] block text-[11px]">Reason:</span>
                    <span className="text-[#E2E8F0]">Automated anti-phishing filter match (#url-spam-protection)</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#949BA4] border-t border-[#3F4147] pt-2">
                  Duration: 1 hour • Audit ID: <span className="font-mono text-[#748FFC]">aud_8f912c</span>
                </div>
              </div>
            )}

            {activeType === "panel" && (
              <div className="bg-[#2B2D31] rounded-lg flex flex-col border-l-4 border-[#FB923C] p-4 my-2 transition-all">
                <div className="flex items-center gap-2 font-semibold text-white mb-2">
                  <Sliders className="h-4 w-4 text-[#FB923C]" />
                  <span>Guild Moderation Hub</span>
                </div>
                <div className="text-xs text-[#DBDEE1] mb-3">
                  Configure real-time automated filters and permit overrides for this guild:
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-[#4E5058] hover:bg-[#6D6F78] text-white px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Anti-Raid Shield
                  </button>
                  <button className="bg-[#248046] hover:bg-[#1A6334] text-white px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer">
                    Permits Editor
                  </button>
                  <button className="bg-[#4E5058] hover:bg-[#6D6F78] text-white px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer">
                    Audit Log
                  </button>
                </div>
              </div>
            )}

            {activeType === "warning" && (
              <div className="bg-[#2B2D31] rounded-lg flex flex-col border-l-4 border-[#F59F00] p-4 my-2 transition-all">
                <div className="flex items-center gap-2 font-semibold text-white mb-1.5">
                  <AlertTriangle className="h-4 w-4 text-[#F59F00]" />
                  <span>Slowmode Threshold Approaching</span>
                </div>
                <div className="text-xs text-[#DBDEE1]">
                  Channel <code className="bg-[#1E1F22] text-[#F59F00] px-1 rounded font-mono">#general</code> is receiving &gt;45 msgs/sec. Automatic rate limit dampening is enabled.
                </div>
              </div>
            )}

            {activeType === "error" && (
              <div className="bg-[#2B2D31] rounded-lg flex flex-col border-l-4 border-[#FA5252] p-4 my-2 transition-all">
                <div className="flex items-center gap-2 font-semibold text-white mb-1.5">
                  <XCircle className="h-4 w-4 text-[#FA5252]" />
                  <span>Permission Denied</span>
                </div>
                <div className="text-xs text-[#DBDEE1]">
                  Missing permit node <code className="bg-[#1E1F22] text-[#FA5252] px-1 rounded font-mono">admin.config.write</code>. Contact a guild administrator for access.
                </div>
              </div>
            )}

            {/* Interactive Discord Reaction Bar */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#3F4147]">
              {Object.keys(reactions).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer select-none",
                    userReacted[emoji]
                      ? "bg-[#5865F2]/20 border border-[#5865F2] text-[#5865F2]"
                      : "bg-[#2B2D31] hover:bg-[#35373C] border border-[#3F4147] text-[#DBDEE1]"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-semibold text-[11px]">{reactions[emoji]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
