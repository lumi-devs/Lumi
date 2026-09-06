export interface NavLink {
  title: string;
  href: string;
}

export interface NavGroup {
  kicker: string;
  title: string;
  links: NavLink[];
}

export const Navigation: NavGroup[] = [
  {
    kicker: "// GETTING STARTED",
    title: "Getting Started",
    links: [
      { title: "Self-Hosting Guide", href: "/guides/self-hosting" },
      { title: "Configuration Reference", href: "/configuration" },
      { title: "Production Deployment", href: "/guides/production-deployment" }
    ]
  },
  {
    kicker: "// CORE ARCHITECTURE",
    title: "Core Architecture",
    links: [
      { title: "System Topology", href: "/architecture" },
      { title: "Distributed Sharding", href: "/sharding" },
      { title: "Event Bus & Redis", href: "/event-bus" },
      { title: "Database & Prisma", href: "/database" },
      { title: "Permissions & Permits", href: "/permissions" },
      { title: "Observability & Metrics", href: "/observability" },
      { title: "Core Modules", href: "/modules" },
      { title: "Web Admin Dashboard", href: "/dashboard" }
    ]
  },
  {
    kicker: "// ADDON SDK",
    title: "Addon SDK",
    links: [
      { title: "Quick Start Guide", href: "/guides/quick-start-addon" },
      { title: "Module Creation", href: "/guides/module-creation" },
      { title: "Publishing & Manifests", href: "/guides/addon-publishing" },
      { title: "API Reference", href: "/api-reference" }
    ]
  },
  {
    kicker: "// GOVERNANCE & HELP",
    title: "Governance & Help",
    links: [
      { title: "Data Privacy & GDPR", href: "/privacy" },
      { title: "License & Attribution", href: "/license" },
      { title: "FAQ", href: "/faq" },
      { title: "Troubleshooting", href: "/troubleshooting" }
    ]
  }
];

export interface AdjacentDoc {
  title: string;
  slug: string;
}

export function getAdjacentDocs(currentSlug: string): {
  prev?: AdjacentDoc;
  next?: AdjacentDoc;
} {
  // Normalize current slug: remove leading/trailing slashes
  const normalizedCurrent = currentSlug.replace(/^\/+|\/+$/g, "");

  // Flatten all navigation links in linear curriculum order
  const flatLinks: Array<{ title: string; slug: string }> = [];
  for (const group of Navigation) {
    for (const link of group.links) {
      const slug = link.href.replace(/^\/+|\/+$/g, "");
      flatLinks.push({
        title: link.title,
        slug
      });
    }
  }

  const currentIndex = flatLinks.findIndex((item) => item.slug === normalizedCurrent);
  if (currentIndex === -1) {
    return {};
  }

  const prev = currentIndex > 0 ? flatLinks[currentIndex - 1] : undefined;
  const next = currentIndex < flatLinks.length - 1 ? flatLinks[currentIndex + 1] : undefined;

  return { prev, next };
}
