import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "./providers";

import { siteConfig } from "@/config/site";
import { fontSans, fontDisplay } from "@/config/fonts";
import { Navbar } from "@/components/navbar";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  // FID-2026-0904-012 item 2: absolute-URL base + sitewide og/twitter
  // defaults. Individual pages override via their own metadata exports.
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    url: "/",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [{ url: "/banner.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/banner.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en" className="dark">
      <head />
      <body
        className={clsx(
          "min-h-screen text-foreground bg-background font-sans antialiased",
          fontSans.variable,
          fontDisplay.variable,
        )}
      >
        {/*
          Full-page operator pattern (FID-021 rev 4): bg.jpg tiles behind the
          entire site, dimmed by an ~85% black overlay so it stays barely
          visible. Fixed attachment so the pattern doesn't scroll with the
          page; pointer-events-none keeps it purely decorative; z-0 sits
          beneath the content wrapper (z-10).
        */}
        <div
          aria-hidden="true"
          className="bg-pattern pointer-events-none fixed inset-0 z-0"
        />
        <div
          aria-hidden="true"
          className="bg-pattern-veil pointer-events-none fixed inset-0 z-0"
        />

        <Providers>
          <div className="relative z-10 flex flex-col h-screen">
            <Navbar />
            <main className="container mx-auto max-w-7xl pt-16 px-6 flex-grow">
              {children}
            </main>
            <footer className="w-full flex items-center justify-center py-3">
              <p className="text-sm text-muted">
                {siteConfig.name} — AI content aggregator
              </p>
            </footer>
          </div>
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
