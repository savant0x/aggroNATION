import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

/**
 * One-shot migration applier (FID-2026-0904-012 rollout). Applies the given
 * migration file to the hosted Supabase Postgres over the pooler, recording
 * it in supabase_migrations.schema_migrations so the `supabase db push`
 * history stays consistent when the CLI is available.
 */

const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
const password = process.env.SUPABASE_DB_PASSWORD!;

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/apply-migration.ts <migration-file>");
  process.exit(1);
}
const name = path.basename(file);
const version = name.split("_")[0];

const { Client } = pg;

const client = new Client({
  host: "aws-0-us-east-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

async function main(): Promise<void> {
  await client.connect();
  const sql = readFileSync(file, "utf8");

  const existing = await client.query(
    `select 1 from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log(`migration ${version} already recorded — skipping`);
    return;
  }

  console.log(`applying ${name} …`);
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`,
    [version, name.replace(/\.sql$/, ""), [sql]],
  );
  console.log(`applied + recorded ${version}`);
}

main()
  .catch((error: unknown) => {
    console.error(
      "migration failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(() => client.end());
