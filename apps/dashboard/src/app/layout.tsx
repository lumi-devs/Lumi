import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "#/components/theme-provider";
import "./globals.css";

// The component itself already guards against SSR/CSR mismatch (renders
// null until it has mounted and checked localStorage), so it doesn't need
// `ssr: false` - this is purely a code-split, deferring `motion/react` and
// the banner markup out of the initial bundle.
const CookieConsent = dynamic(() =>
  import("../components/cookie-consent").then((mod) => mod.CookieConsent),
);

// Self-hosted via next/font (built at compile time, served from /_next/static)
// instead of an `@import url(fonts.googleapis.com/...)`. This is strictly
// better for the CSP in next.config.ts: no external font/style origin needs
// allow-listing, and there's no render-blocking third-party font request.
//
// Geist carries chrome (headings, nav, buttons, labels, table headers). Body
// copy uses the OS system-font stack directly (see --font-sans in
// globals.css) rather than a shipped web font — on Apple platforms that's
// San Francisco at zero bytes. JetBrains Mono stays for IDs/timestamps/counts.
const display = Geist({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-geist",
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
  other: {
    // Tells Dark Reader (and similarly-behaved extensions) this page already
    // ships its own light/dark theme — without this they rewrite every
    // colored attribute (stroke/fill/style) client-side before React
    // hydrates, which causes SSR/CSR hydration-mismatch errors on every
    // icon in the tree. See https://github.com/darkreader/darkreader#how-to-disable-dark-reader-on-my-website
    "darkreader-lock": "1",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0f" },
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
      className={`${display.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
