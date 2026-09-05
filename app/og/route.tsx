import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

/**
 * Branded OG card generator (FID-2026-0904-022 stream B): 1200×630 PNG via
 * next/og — every social share renders an aggroNATION card, even when the
 * source's own thumbnail 429s or fails CSP. System fonts only; inline styles
 * only (ImageResponse CSS subset). Params: title, type, meta.
 */

export const revalidate = 86400;

const TYPE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  rss: "RSS",
  reddit: "Reddit",
  huggingface: "HuggingFace",
  trendshift: "Trendshift",
  opensource: "Open Source Projects",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? siteConfig.name).slice(0, 140);
  const type = searchParams.get("type") ?? "rss";
  const meta = (searchParams.get("meta") ?? "").slice(0, 90);
  const typeLabel = TYPE_LABELS[type] ?? type.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "linear-gradient(135deg, #0a0a12 0%, #12101f 55%, #1a1230 100%)",
          color: "#f4f4f6",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#8b5cf6",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              textTransform: "lowercase",
              display: "flex",
            }}
          >
            {siteConfig.name}
          </div>
          <div
            style={{
              marginLeft: 12,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#a78bfa",
              display: "flex",
            }}
          >
            {typeLabel}
          </div>
        </div>

        <div
          style={{
            fontSize: title.length > 90 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            color: "#9b9bb0",
          }}
        >
          <div style={{ display: "flex" }}>{meta}</div>
          <div style={{ display: "flex", color: "#7c7c92" }}>
            aggro-nation.vercel.app
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
