import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "#/components/theme-provider";
import "./globals.css";

// Self-hosted via next/font (built at compile time, served from /_next/static)
// instead of the old dashboard's `@import url(fonts.googleapis.com/...)`.
// This is strictly better for the CSP in next.config.ts: no external
// font/style origin needs allow-listing, and there's no render-blocking
// third-party font request.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
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
  themeColor: "#04060c",
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
      className={`${outfit.variable} ${jakarta.variable} ${mono.variable}`}
    >
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
