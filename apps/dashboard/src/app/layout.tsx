import type { Metadata, Viewport } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "#/components/theme-provider";
import "./globals.css";

// Self-hosted via next/font (built at compile time, served from /_next/static)
// instead of an `@import url(fonts.googleapis.com/...)`. This is strictly
// better for the CSP in next.config.ts: no external font/style origin needs
// allow-listing, and there's no render-blocking third-party font request.
//
// Geist carries chrome (headings, nav, buttons, labels, table headers); Inter
// carries body copy. JetBrains Mono stays for IDs/timestamps/counts.
const display = Geist({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
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
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
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
