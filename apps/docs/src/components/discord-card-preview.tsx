import * as React from "react";

export function DiscordCardPreview() {
  return (
    <div className="bg-[#313338] text-[#DBDEE1] rounded-lg p-4 font-sans text-sm max-w-lg w-full border border-[#1E1F22] shadow-lg">
      <div className="flex gap-4">
        <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs">L</span>
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-white">Lumi</span>
            <span className="text-xs bg-[#5865F2] text-white px-1.5 py-0.5 rounded flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20l-6-6 1.41-1.41L10 17.17l10-10L21.41 8 10 20z"/></svg>
              APP
            </span>
            <span className="text-[#949BA4] text-xs">Today at 12:00 PM</span>
          </div>
          <div className="bg-[#2B2D31] rounded flex flex-col border-l-4 border-[#12B886] p-4 mt-2">
            <div className="font-semibold text-white mb-2">Configuration Saved Successfully</div>
            <div className="text-sm">Your module settings have been updated and are now live.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
