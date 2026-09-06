export interface NavLink {
  title: string;
  href: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export const siteName = "Lumi Docs";

export const navigation: NavGroup[] = [
  {
    title: "Start",
    links: [
      { title: "Getting Started", href: "/getting-started" },
      { title: "Configuration", href: "/configuration" },
    ],
  },
  {
    title: "System",
    links: [
      { title: "Architecture", href: "/architecture" },
      { title: "Dashboard", href: "/dashboard" },
      { title: "RPC Reference", href: "/rpc" },
    ],
  },
  {
    title: "Build",
    links: [
      { title: "Module Creation", href: "/modules" },
      { title: "Add-ons", href: "/addons" },
    ],
  },
];

export const allLinks: NavLink[] = navigation.flatMap((group) => group.links);
