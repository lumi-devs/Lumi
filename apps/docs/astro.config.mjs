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
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#ff8a3d" },
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
          attrs: { name: "twitter:card", content: "summary" },
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
            { label: "Modules", slug: "modules", badge: { text: "Updated", variant: "tip" } },
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
