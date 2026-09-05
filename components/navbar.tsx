"use client";

/**
 * aggroNATION "signal bar" (FID-2026-0904-005 — designed from scratch after
 * the operator rejected the FID-002 component-kit look).
 *
 * Design: subtraction. No boxes, no fills, no borders in the chrome — a slim
 * translucent blur over the page, a lowercase type-led wordmark with a
 * pulsing signal dot (the live pipeline, the product's whole story), and
 * editorial uppercase links whose ONLY state is a 1px gradient underline
 * under the active item. Utilities sit bare in one row. Space and type
 * carry the hierarchy; the accent appears exactly twice (dot + underline).
 */

import { useState } from "react";
import { TextField, InputGroup } from "@heroui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { GithubIcon, SearchIcon } from "@/components/icons";
import { AuthNav } from "@/components/auth-nav";
import { CommandPalette } from "@/components/command-palette";

const isActivePath = (pathname: string, href: string): boolean =>
  href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";

  const searchInput = (
    <form action="/search" method="GET" role="search">
      <TextField aria-label="Search" type="search" name="q">
        <InputGroup>
          <InputGroup.Prefix>
            <SearchIcon className="text-base text-muted pointer-events-none flex-shrink-0" />
          </InputGroup.Prefix>
          <InputGroup.Input
            className="border-b border-transparent bg-transparent text-sm shadow-none focus-visible:border-b-[var(--color-edge)]"
            placeholder="Search the index"
          />
        </InputGroup>
      </TextField>
    </form>
  );

  return (
    <nav className="sticky top-0 z-40 w-full bg-[var(--color-base)]/55 backdrop-blur-xl">
      {/* FID-2026-0904-022 stream C: ⌘K palette — one instance sitewide;
          panel content mounts only while open. */}
      <CommandPalette />
      <header className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-6 px-6">
        {/* Brand: live signal dot + lowercase wordmark. No tile, no logo
            box — the favicon owns the mark; the dot owns the story. */}
        <NextLink className="group flex items-center gap-2.5" href="/">
          <span aria-hidden="true" className="signal-dot block" />
          <span className="font-[family-name:var(--font-display)] text-lg font-bold lowercase tracking-tight text-[var(--color-text-primary)] transition-colors duration-200 group-hover:text-[var(--color-accent-bright)]">
            {siteConfig.name}
          </span>
        </NextLink>

        {/* Editorial nav: uppercase, wide-tracked, underline-only states. */}
        <ul className="hidden items-center gap-7 lg:flex">
          {siteConfig.navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <NextLink
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex h-14 items-center text-[12px] font-medium uppercase tracking-[0.14em] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                    active
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                  href={item.href}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`gradient-line absolute inset-x-0 bottom-3 h-px transition-opacity duration-200 ${
                      active ? "opacity-100" : "opacity-0 hover:opacity-60"
                    }`}
                  />
                </NextLink>
              </li>
            );
          })}
        </ul>

        {/* Utilities: bare, one row, no container. */}
        <div className="flex items-center gap-5">
          <div className="hidden w-44 lg:block">{searchInput}</div>
          <a
            aria-label="GitHub"
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-text-muted)] transition-colors duration-200 hover:text-[var(--color-text-primary)]"
          >
            <GithubIcon size={18} />
          </a>
          <ThemeSwitch />
          <ul className="hidden items-center lg:flex">
            <AuthNav />
          </ul>
          <button
            aria-expanded={isMenuOpen}
            aria-label="Toggle menu"
            className="p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] lg:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMenuOpen ? (
                <path
                  d="M6 18L18 6M6 6l12 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                />
              )}
            </svg>
          </button>
        </div>
      </header>

      {isMenuOpen && (
        <div className="border-t border-[var(--color-edge)]/60 bg-[var(--color-base)]/90 backdrop-blur-xl lg:hidden">
          <div className="px-6 pt-4">{searchInput}</div>
          <ul className="flex flex-col px-6 py-4">
            {siteConfig.navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <NextLink
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 border-b border-[var(--color-edge)]/40 py-3 text-sm font-medium uppercase tracking-[0.14em] transition-colors ${
                      active
                        ? "text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-muted)]"
                    }`}
                    href={item.href}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${
                        active
                          ? "bg-[var(--color-accent-bright)]"
                          : "bg-transparent"
                      }`}
                    />
                    {item.label}
                  </NextLink>
                </li>
              );
            })}
            <div className="flex items-center gap-4 pt-4">
              <AuthNav />
            </div>
          </ul>
        </div>
      )}
    </nav>
  );
};
