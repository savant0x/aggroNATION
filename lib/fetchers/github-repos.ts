/**
 * GitHub repo enrichment fetcher (FID-2026-0904-009) — real data acquisition,
 * NO database imports.
 *
 * The GitHub REST API is the authoritative source for repo facts (description,
 * stars, forks, language, topics, license, homepage, last push). Called ONLY
 * from the fetch cycle (cron-time denormalization — the operator's explicit
 * architecture call): renders never hit GitHub.
 *
 * Auth: `GITHUB_TOKEN` (no scopes needed) raises the limit from 60 to 5,000
 * req/h. Absent token = unauthenticated mode; a 403 with the rate-limit header
 * surfaces as a config-class warning, never a crash.
 *
 * Same partial-failure contract as every fetcher: per-item loss is collected
 * into `errors[]`; only catastrophic input conditions throw.
 */

const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const API_BASE = "https://api.github.com/repos/";

export interface GithubRepoData {
  slug: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  license: string | null;
  homepage: string | null;
  pushedAt: string | null;
  /** Render helper — the official og-card for the repo (no auth needed). */
  ogImageUrl: string;
}

export interface GithubReposResult {
  repos: Map<string, GithubRepoData>;
  errors: string[];
  /** True when GitHub reports the token/account is rate-limited. */
  rateLimited: boolean;
}

function githubToken(): string | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? token : null;
}

export function githubOgImageUrl(slug: string): string {
  return `https://opengraph.githubassets.com/1/${slug}`;
}

/** "owner/repo" from a GitHub URL, else null. Not for arbitrary text. */
export function extractGithubSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "github.com" &&
      parsed.hostname !== "www.github.com"
    ) {
      return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1];
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
      return null;
    }
    return `${owner}/${repo}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Parse the repos endpoint's JSON into the enrichment shape. */
export function parseRepoResponse(slug: string, body: unknown): GithubRepoData {
  const record = (body ?? {}) as Record<string, unknown>;
  const description =
    typeof record.description === "string" && record.description.length > 0
      ? record.description
      : null;
  const topics = Array.isArray(record.topics)
    ? record.topics
        .filter((t): t is string => typeof t === "string")
        .slice(0, 12)
    : [];
  const license =
    record.license !== null && typeof record.license === "object"
      ? (((record.license as Record<string, unknown>).spdx_id as
          | string
          | null) ?? null)
      : null;

  return {
    slug,
    description,
    stars:
      typeof record.stargazers_count === "number" ? record.stargazers_count : 0,
    forks: typeof record.forks_count === "number" ? record.forks_count : 0,
    language: typeof record.language === "string" ? record.language : null,
    topics,
    license: license && license !== "NOASSERTION" ? license : null,
    homepage:
      typeof record.homepage === "string" && record.homepage.length > 0
        ? record.homepage
        : null,
    pushedAt: typeof record.pushed_at === "string" ? record.pushed_at : null,
    ogImageUrl: githubOgImageUrl(slug),
  };
}

async function fetchOne(slug: string): Promise<GithubRepoData> {
  const token = githubToken();
  const response = await fetch(`${API_BASE}${slug}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "aggroNATION/1.0 (content-aggregator)",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new Error(`repo not found (404): ${slug}`);
  }
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    throw new Error(
      `rate limited by GitHub (HTTP ${response.status}, remaining=${remaining ?? "?"}) — cron frequency or GITHUB_TOKEN needs review`,
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${slug}`);
  }
  return parseRepoResponse(slug, await response.json());
}

export async function fetchRepoData(
  slugs: string[],
  options: { maxRepos?: number } = {},
): Promise<GithubReposResult> {
  const maxRepos = options.maxRepos ?? 60;
  // Dedupe case-insensitively; GitHub canonicalizes to lowercase in URLs.
  const targets = Array.from(new Set(slugs.map((s) => s.toLowerCase()))).slice(
    0,
    maxRepos,
  );

  const repos = new Map<string, GithubRepoData>();
  const errors: string[] = [];
  let rateLimited = false;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const slug = targets[cursor];
      cursor += 1;
      try {
        const data = await fetchOne(slug);
        repos.set(slug, data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("rate limited")) rateLimited = true;
        errors.push(`GitHub ${slug}: ${message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
  );

  return { repos, errors, rateLimited };
}
