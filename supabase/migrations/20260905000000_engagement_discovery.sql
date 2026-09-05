-- ============================================================================
-- FID-2026-0904-023 streams A+B+C — engagement schema: bookmarks, reactions,
-- threaded comments. Follows the FID-2026-0904-010 conventions: text PKs,
-- denormalized user_email (comment precedent), archived soft-delete, check
-- constraints mirroring the zod type sets. Access is via the service client
-- with session enforcement in the API layer (comment-repo precedent — Law 11).
-- No content-table changes: existing setof-content read functions are NOT
-- invalidated (the FID-2026-0904-022 self-correct does not repeat).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- bookmarks (stream A) — one saved item per user per content row
-- ---------------------------------------------------------------------------
create table public.bookmarks (
  user_id    text not null,
  content_id text not null references public.content(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- reactions (stream C) — one reaction per user per content row
-- ---------------------------------------------------------------------------
create table public.reactions (
  user_id    text not null,
  content_id text not null references public.content(id) on delete cascade,
  kind       text not null default '+' check (kind in ('+')),
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index if not exists reactions_content_idx on public.reactions (content_id);

-- ---------------------------------------------------------------------------
-- threaded comments (stream B) — nullable parent, one display level
-- ---------------------------------------------------------------------------

-- parent_id references the same table; on delete set null keeps replies
-- readable if a parent is ever hard-deleted (archived is the normal path).
alter table public.comments
  add column parent_id text references public.comments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- read helpers (streams A/C) — count + existence probes used by the API
-- ---------------------------------------------------------------------------
create or replace function public.bookmark_exists(
  p_user_id text,
  p_content_id text
) returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.bookmarks b
    where b.user_id = p_user_id and b.content_id = p_content_id
  );
$$;

create or replace function public.reaction_exists(
  p_user_id text,
  p_content_id text
) returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.reactions r
    where r.user_id = p_user_id and r.content_id = p_content_id
  );
$$;
