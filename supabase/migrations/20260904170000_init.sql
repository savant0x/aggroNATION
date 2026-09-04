-- ============================================================================
-- FID-2026-0904-010 — aggroNATION initial schema on Supabase (migrated from
-- Firestore). Tables mirror the Firestore collections 1:1; ids are preserved
-- verbatim (content deterministic ids `{type}_{externalId}`, source uuid
-- strings) so /article URLs, comment links, and foreign keys survive the
-- data migration losslessly. The zod schemas in lib/schemas/content.ts remain
-- the domain source of truth; this SQL keeps the same type sets via check
-- constraints (schema changes must touch both — recorded in the FID).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
create table public.sources (
  id               text primary key,
  type             text not null check (type in ('youtube','rss','reddit','huggingface','trendshift','opensource')),
  name             text not null,
  url              text not null,
  enabled          boolean not null default true,
  archived         boolean not null default false,
  config           jsonb not null default '{}'::jsonb,
  metadata         jsonb not null default '{}'::jsonb,
  resolution_cache jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- content
-- ---------------------------------------------------------------------------
create table public.content (
  id            text primary key,
  source_id     text not null references public.sources(id) on delete cascade,
  source_type   text not null check (source_type in ('youtube','rss','reddit','huggingface','trendshift','opensource')),
  external_id   text not null,
  title         text not null,
  excerpt       text not null default '',
  content_html  text,
  url           text not null,
  thumbnail_url text,
  source_name   text,
  github        jsonb,
  author        text not null default '',
  published_at  timestamptz not null,
  tags          jsonb not null default '[]'::jsonb,
  metrics       jsonb not null default '{}'::jsonb,
  featured      boolean not null default false,
  archived      boolean not null default false,
  created_at    timestamptz,
  updated_at    timestamptz not null default now()
);

-- Read-path indexes (replace firestore.indexes.json composites 1:1).
create index content_source_type_archived_published
  on public.content (source_type, archived, published_at desc);
create index content_archived_published
  on public.content (archived, published_at desc);
create index content_source_id_archived_published
  on public.content (source_id, archived, published_at desc);
-- Views ranking: coalesce keeps missing metrics rows indexable (jsonb 'views'
-- is always written by the fetchers, but never trust that).
create index content_source_id_archived_views
  on public.content (source_id, archived, coalesce(((metrics->>'views')::int), 0) desc);

-- ---------------------------------------------------------------------------
-- comments (FID-013): append-only; moderation = soft archive.
-- ---------------------------------------------------------------------------
create table public.comments (
  id         text primary key default gen_random_uuid()::text,
  content_id text not null references public.content(id) on delete cascade,
  user_id    text not null,
  user_email text not null,
  body       text not null check (char_length(body) between 1 and 2000),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_content_archived_created
  on public.comments (content_id, archived, created_at desc);

-- ---------------------------------------------------------------------------
-- profiles (mirror of auth.users for SQL/audit; the runtime admin gate reads
-- the JWT app_metadata claim — 1:1 with the retired Firebase custom claim).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  is_admin        boolean not null default false,
  last_sign_in_at timestamptz
);

-- ============================================================================
-- Row Level Security — defense-in-depth mirror of firestore.rules. Server
-- code uses the service_role key (BYPASSRLS — the Admin-SDK-parity model);
-- the browser never reads the DB directly today, so these policies guard the
-- anon/authenticated roles for the future, not today's traffic.
-- ============================================================================
alter table public.sources  enable row level security;
alter table public.content  enable row level security;
alter table public.comments enable row level security;
alter table public.profiles enable row level security;

-- content: world-readable (matches firestore.rules). No write policies —
-- all writes flow through the service role (mirrors "allow write: if false").
create policy content_world_read on public.content
  for select using (true);

-- sources: only service role (no anon/authenticated policies → denied).
-- comments: world-read; authenticated users may create only their own rows
-- (mirrors firestore.rules comment policy).
create policy comments_world_read on public.comments
  for select using (true);
create policy comments_self_create on public.comments
  for insert with check (auth.uid()::text = user_id);

-- profiles: owner read/update.
create policy profiles_owner_read on public.profiles
  for select using (auth.uid() = id);
create policy profiles_owner_update on public.profiles
  for update using (auth.uid() = id);

-- ============================================================================
-- Read-path SQL functions — replace the Firestore composite-index query
-- shapes (FID-002/006/008/009 selectors) with single statements. Repos call
-- these via rpc() and map rows → zod ContentItem; the round-robin/top-up
-- orchestration logic that FID-006/009 verified stays in the repo, but the
-- N+1 per-source query loop collapses into one call.
-- ============================================================================

-- Per-source capped newest rows for one source type: every enabled source of
-- the type contributes its `p_cap` freshest items (FID-006 diversified
-- selector input; FID-009 merged variant feeds types[]).
create or replace function public.content_capped(
  p_types text[],
  p_cap int
) returns setof public.content
language sql stable
as $$
  with ranked as (
    select c.*,
           row_number() over (
             partition by c.source_id
             order by c.published_at desc, c.id desc
           ) as rn
    from public.content c
    where c.archived = false
      and c.source_type = any(p_types)
      and c.source_id in (
        select s.id from public.sources s
        where s.enabled and not s.archived and s.type = any(p_types)
      )
  )
  select id, source_id, source_type, external_id, title, excerpt, content_html,
         url, thumbnail_url, source_name, github, author, published_at, tags,
         metrics, featured, archived, created_at, updated_at
  from ranked
  where rn <= greatest(p_cap, 1);
$$;

-- Top-N by impressions (FID-008 / getTopByViewsForSource).
create or replace function public.content_top_views(
  p_source_id text,
  p_limit int
) returns setof public.content
language sql stable
as $$
  select c.*
  from public.content c
  where c.archived = false and c.source_id = p_source_id
  order by coalesce(((c.metrics->>'views')::int), 0) desc, c.published_at desc
  limit greatest(p_limit, 1);
$$;

-- Keyset pagination (FID-015 + FID-009 merged types). Ordering is
-- (published_at desc, id desc) — the id tiebreak fixes Firestore's unstable
-- same-second pages. Cursors encode (publishedAt, id):
--   next page (older):   p_before_published/p_before_id  = last row of page
--   prev page (newer):   p_after_published/p_after_id    = first row of page
-- Returned rows are always (published_at desc, id desc).
create or replace function public.content_page(
  p_types text[],
  p_page_size int,
  p_before_published timestamptz default null,
  p_before_id text default null,
  p_after_published timestamptz default null,
  p_after_id text default null
) returns setof public.content
language plpgsql stable
as $$
begin
  if p_after_published is not null then
    -- Prev page: the `p_page_size` rows strictly newer than the bound,
    -- ascending-windowed then re-reversed so the caller always reads desc.
    return query
      select * from (
        select c.*
        from public.content c
        where c.archived = false
          and (p_types is null or c.source_type = any(p_types))
          and (c.published_at, c.id) > (p_after_published, p_after_id)
        order by c.published_at asc, c.id asc
        limit p_page_size
      ) t
      order by t.published_at desc, t.id desc;
  else
    return query
      select c.*
      from public.content c
      where c.archived = false
        and (p_types is null or c.source_type = any(p_types))
        and (p_before_published is null or (c.published_at, c.id) < (p_before_published, p_before_id))
      order by c.published_at desc, c.id desc
      limit p_page_size;
  end if;
end;
$$;
