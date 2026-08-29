import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://lumi-devs.github.io",
  base: "/Lumi",
  integrations: [
    starlight({
      title: "Lumi",
      description:
        "Documentation for Lumi, a modular self-hosted Discord bot framework built with TypeScript and Bun.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Lumi",
        replacesTitle: false,
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/lumi-devs/Lumi" },
      ],
      editLink: {
        baseUrl: "https://github.com/lumi-devs/Lumi/edit/main/apps/docs/",
      },
      lastUpdated: true,
      pagination: true,
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      expressiveCode: {
        themes: ["github-dark-default", "github-light"],
        styleOverrides: {
          borderRadius: "0.875rem",
          borderColor: "rgba(255, 255, 255, 0.1)",
          codeFontFamily:
            "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
          codeFontSize: "0.85rem",
          codeLineHeight: "1.65",
          frames: {
            shadowColor: "rgba(0, 0, 0, 0.35)",
            editorActiveTabIndicatorTopColor: "#0a84ff",
            editorActiveTabIndicatorBottomColor: "#0a84ff",
            terminalTitlebarDotsForeground: "#ff5f57",
            terminalTitlebarDotsOpacity: "0.9",
          },
        },
      },
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#0071e3" },
        },
        {
          tag: "meta",
          attrs: { property: "og:type", content: "website" },
        },
        {
          tag: "meta",
          attrs: { property: "og:site_name", content: "Lumi Docs" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap",
          },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Self-hosting", slug: "guides/self-hosting" },
            { label: "Production deployment", slug: "guides/production-deployment" },
            { label: "Configuration", slug: "configuration" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Architecture", slug: "architecture" },
            { label: "What Lumi does", slug: "modules" },
            { label: "Dashboard", slug: "dashboard" },
            { label: "API reference", slug: "api-reference" },
            { label: "Troubleshooting", slug: "troubleshooting" },
            { label: "FAQ", slug: "faq" },
          ],
        },
        {
          label: "Building addons",
          items: [
            { label: "Quick start", slug: "guides/quick-start-addon" },
            { label: "Creating a module", slug: "guides/module-creation" },
            { label: "Publishing an addon", slug: "guides/addon-publishing" },
          ],
        },
      ],
    }),
    mdx(),
  ],
});
