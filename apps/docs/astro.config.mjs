import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://lumi-devs.github.io",
  base: "/Lumi",
  integrations: [
    starlight({
      title: "Lumi",
      description: "Documentation for Lumi, a modular Discord bot.",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/lumi-devs/Lumi" },
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
            { label: "Modules", slug: "modules" },
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
  ],
});
