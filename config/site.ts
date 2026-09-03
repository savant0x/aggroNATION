export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "aggroNATION",
  description:
    "Intelligent AI content aggregator — YouTube, RSS, Reddit and X, fetched automatically and ranked by engagement.",
  navItems: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "YouTube",
      href: "/youtube",
    },
    {
      label: "About",
      href: "/about",
    },
  ],
  links: {
    github: "https://github.com/spenc-howell/aggroNATION",
  },
};
