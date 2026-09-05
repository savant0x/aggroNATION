import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { detectJunk, type ScrubFinding } from "@/lib/quality/scrubber";

/**
 * Daily content-quality sweep (FID-2026-0904-018): scans everything updated
 * in the trailing 24h against the junk-pattern detector and reports findings.
 * Detection only — nothing is deleted or modified autonomously; findings go
 * to the server log and the fetch cycle's summary so pollution surfaces the
 * day it lands (cron annotations make it visible in GitHub Actions).
 *
 * Scoped to recently-updated rows: the full corpus was audited clean in the
 * FID-017 follow-up, so re-scanning everything every day would burn reads
 * for nothing. New pollution arrives through the fetch cycle, which stamps
 * updated_at.
 */
export async function runDailyScrub(): Promise<ScrubFinding[]> {
  const client = getServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("content")
    .select("id, content_html")
    .eq("archived", false)
    .gte("updated_at", since)
    .not("content_html", "is", null)
    .limit(2000);

  if (error) {
    throw new Error(`runDailyScrub query failed: ${error.message}`);
  }

  const findings: ScrubFinding[] = [];
  for (const row of data ?? []) {
    const pattern = detectJunk(row.content_html as string);
    if (pattern) {
      findings.push({
        contentId: row.id as string,
        pattern,
        preview: (row.content_html as string)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 90),
      });
    }
  }

  if (findings.length > 0) {
    console.error(
      `[scrub] ${findings.length} junk-pattern finding(s) in the last 24h:`,
    );
    for (const f of findings) {
      console.error(`  [scrub] ${f.pattern} — ${f.contentId}: "${f.preview}"`);
    }
  }

  return findings;
}
