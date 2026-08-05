import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Sans,
  JetBrains_Mono,
  Saira_Semi_Condensed,
} from "next/font/google";
import { ThemeProvider } from "#/components/theme-provider";
import "./globals.css";

// Self-hosted via next/font (built at compile time, served from /_next/static)
// instead of an `@import url(fonts.googleapis.com/...)`. This is strictly
// better for the CSP in next.config.ts: no external font/style origin needs
// allow-listing, and there's no render-blocking third-party font request.
//
// ── Type pairing: "engineering blueprint / operator console" ──────────────
//
// Saira Semi Condensed — chrome. A technical, squarish semi-condensed grotesk
// in the DIN/signage lineage: flat-sided bowls, low stroke contrast, an
// unmistakably engineered rhythm. It carries page titles, panel titles, nav
// items, buttons, badges, table headers and the wide uppercase micro-labels.
// Being semi-condensed is functional here, not just stylistic: a 20-item
// sidebar and a 6-column table both gain real horizontal room per label.
//
// IBM Plex Sans — body. Drawn for engineering documentation, so it holds up at
// the 12–13px this app lives at while still having character (the tailed `l`,
// the flat-terminal `a`, the slightly mechanical `g`). It carries descriptions,
// hints, table prose and input text.
//
// JetBrains Mono — data. Snowflake IDs, module names, git URLs, digests.
const display = Saira_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-saira",
  display: "swap",
});
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Lumi Dashboard",
    template: "%s · Lumi",
  },
  description:
    "Configure every Lumi feature for your Discord servers — modular, anti-nuke, dynamic voice, permit-based moderation.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
