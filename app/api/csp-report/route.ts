/**
 * CSP violation report collector (FID-2026-0904-013 §3).
 *
 * Browsers POST violation reports here when a page's CSP (or
 * Report-Only policy) is violated. A logging sink only:
 *  - accepts both `application/csp-report` (classic) and
 *    `application/reports+json` (Reporting API) shapes,
 *  - responds 204 regardless of body validity (browsers fire-and-forget;
 *    a 4xx would just produce console noise in devtools),
 *  - logs one line per violation: disposition, violated-directive,
 *    blocked-uri, source-file(:line), and the report body cap is 8 KB
 *    (oversize → 413, never processed).
 *
 * No auth by spec (browsers send these pre-auth); no storage; nothing is
 * reflected. The route is inside /api/ which robots.ts already disallows.
 */

const MAX_BODY_BYTES = 8 * 1024;

interface CspReportBody {
  disposition?: string;
  [key: string]: unknown;
}

interface ViolationReport {
  disposition?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "document-uri"?: string;
  "source-file"?: string;
  "line-number"?: number;
  "column-number"?: number;
  [key: string]: unknown;
}

function extractViolations(payload: unknown): ViolationReport[] {
  // Classic shape: {"csp-report": {...}}
  if (
    payload &&
    typeof payload === "object" &&
    "csp-report" in (payload as Record<string, unknown>)
  ) {
    return [
      (payload as Record<string, unknown>)["csp-report"] as ViolationReport,
    ];
  }
  // Reporting API shape: [{"type": "csp-violation", "body": {...}}, …]
  if (Array.isArray(payload)) {
    return payload
      .filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          ((entry as Record<string, unknown>).type === "csp-violation" ||
            (entry as Record<string, unknown>).body !== undefined),
      )
      .map(
        (entry) => (entry as Record<string, unknown>).body as ViolationReport,
      );
  }
  return [];
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/csp-report") &&
    !contentType.includes("application/reports+json") &&
    !contentType.includes("application/json")
  ) {
    return new Response(null, { status: 415 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }
    payload = JSON.parse(raw) as unknown;
  } catch {
    // Malformed body: browsers don't retry; ack and move on.
    return new Response(null, { status: 204 });
  }

  const outer = (payload ?? {}) as CspReportBody;
  for (const violation of extractViolations(payload)) {
    const disposition = violation.disposition ?? outer.disposition ?? "unknown";
    const directive =
      violation["effective-directive"] ??
      violation["violated-directive"] ??
      "unknown";
    const blocked = violation["blocked-uri"] ?? "unknown";
    const source = violation["source-file"] ?? "unknown";
    const line = violation["line-number"] ?? "";
    console.warn(
      `[csp-report] disposition=${disposition} directive=${directive} blocked=${blocked} source=${source}:${line}`,
    );
  }

  return new Response(null, { status: 204 });
}
