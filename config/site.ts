export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "aggroNATION",
  url: "https://aggro-nation.vercel.app",
  description:
    "Intelligent AI content aggregator — YouTube, RSS, Reddit, HuggingFace and GitHub repos, fetched automatically and ranked by engagement.",
  adminPath: "/admin",
  navItems: [
    {
      label: "Home",
      href: "/",
    },
    {
      label: "Briefing",
      href: "/digest",
    },
    {
      label: "YouTube",
      href: "/youtube",
    },
    {
      label: "RSS",
      href: "/rss",
    },
    {
      label: "Reddit",
      href: "/reddit",
    },
    {
      label: "HuggingFace",
      href: "/huggingface",
    },
    {
      label: "GitHub",
      href: "/github",
    },
    {
      label: "About",
      href: "/about",
    },
  ],
  links: {
    github: "https://github.com/savant0x/aggroNATION",
  },
};
