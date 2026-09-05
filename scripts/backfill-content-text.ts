/**
 * One-time backfill (FID-2026-0904-022 stream A): populate content_text
 * (the plain-text twin of content_html that feeds the search_tsv generated
 * column) for rows written before the column existed. NULL-guarded and
 * idempotent — re-runs only touch rows still missing the twin. Paced to
 * stay polite to the pooler.
 */

import "dotenv/config";

import pg from "pg";

import { htmlToPlainText } from "../lib/quality/scrubber";

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
const password = process.env.SUPABASE_DB_PASSWORD!;

const { Client } = pg;

async function main(): Promise<void> {
  const client = new Client({
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${projectRef}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query<{ id: string; content_html: string }>(
    `select id, content_html from public.content
     where content_html is not null and content_text is null`,
  );
  console.log(`rows to backfill: ${rows.length}`);

  let updated = 0;
  for (const row of rows) {
    const text = htmlToPlainText(row.content_html);
    await client.query(`update public.content set content_text = $1 where id = $2`, [
      text,
      row.id,
    ]);
    updated += 1;
    if (updated % 20 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const { rows: leftover } = await client.query<{ count: string }>(
    `select count(*)::text as count from public.content
     where content_html is not null and content_text is null`,
  );
  console.log(`backfilled: ${updated}, remaining NULL: ${leftover[0]?.count ?? "0"}`);
  await client.end();
}

main().catch((error: unknown) => {
  console.error("backfill failed:", error);
  process.exit(1);
});
