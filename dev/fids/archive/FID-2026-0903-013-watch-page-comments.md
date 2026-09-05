> **[ARCHIVED — SUPERSEDED]** This FID documents the Firebase/Firestore architecture replaced by FID-2026-0904-010 (Supabase migration). Its code paths no longer exist; it is kept for historical record only. The behavioral contract it established survived the migration unless a 0904-series FID explicitly supersedes it.

# FID-013 — Watch Page + Comments

| Field        | Value |
| ------------ | ----- |
| **Filename** | `FID-2026-0903-013-watch-page-comments.md` |
| **ID**       | FID-2026-0903-013 |
| **Severity** | major |
| **Status**   | verified |
| **Created**  | 2026-09-03 |
| **Author**   | SCOPE.md operator interaction correction (play → dedicated watch page; titles → in-site detail page with details + comments) |

## Summary

The FID-011 in-page expand/collapse got the interaction wrong on two counts. (1) The play button must open a **dedicated in-site watch page** with the video embedded — not play inside the grid row. (2) Card titles are not links; clicking a title must open the same watch page on aggronation, showing the video's details (from YouTube) **and a comment section**. The no-exit law holds: both paths stay on-site; the watch page is the in-site consumption destination.

## Evidence (RED)

- Operator: "when you click the video's play button, it is supposed to open a new page with the video embedded. Currently it simply plays the video in the row. Also the title bars are not links — when a title is clicked, it's supposed to open the page on aggronation, with the details from youtube, a comment section, etc."
- `components/home/YouTubeEmbed.tsx` — expand/collapse plays in-row; no detail destination exists.
- `components/home/ContentCard.tsx` — title is an `<h3>`, not a link.
- `app/` has no `/watch` route; no comments schema/repo/API anywhere (grep `comment` in lib/ → rating comment-count field only).
- Firestore rules deny all writes to `content`; no `comments` collection rules exist → default-deny. Comments need rules.

## Proposed Solution (GREEN)

1. **Watch route** — `app/watch/[videoId]/page.tsx` (server, ISR 300s): full-width embedded player (`youtube-nocookie.com/embed/{id}`), title, author, publish date, view/like/comment metrics, full description (from the stored YouTube snapshot), and the comment section. Content doc id = `youtube_{videoId}` (deterministic, FID-002) — the route param IS the externalId; lookup by exact doc id (1 read). Unknown id → not-found state (no fake data).
2. **`lib/schemas/content.ts`** — add `commentSchema`: id (auto), contentId, userId, userEmail (display), body (1–2000 chars, trimmed), createdAt, archived:false. `buildCommentDocId(contentId, userId, createdAt)` not needed — comments are append-only, auto-id, queried by composite index (contentId ASC, createdAt DESC, archived ASC).
3. **`lib/repositories/comment-repo.ts`** — the ONLY writer of `comments`: `listComments(contentId, limit)`, `createComment({contentId, userId, userEmail, body})` (schema-validated; contentId must reference an existing non-archived content doc — validated in the route), `archiveComment(commentId)` (soft delete for moderation).
4. **API** — `app/api/comments/route.ts`: GET `?contentId=` → list (public read, world-readable content law); POST → `getCurrentUser()` gate (401 if signed out), schema parse (422), content-exists check (404), insert (201). `app/api/comments/[id]/route.ts`: DELETE → author-self OR admin (`archiveComment`), else 403.
5. **`components/comments/CommentSection.tsx`** (client) — list + post form. Signed-out users see the form disabled with a sign-in link. Post → refresh list client-side (no full refresh needed). Delete own comment / admin deletes any (server enforces).
6. **Linking** — `components/home/YouTubeEmbed.tsx`: play button and title become `<Link href={`/watch/${videoId}`}>` (no in-row playback); grid cards stay non-navigating for content *consumption* except to the in-site watch page (law intact — /watch is on-site). `ContentCard` non-youtube branch: title links to the watch route pattern too (`/watch/{externalId}` — page renders honest "playback not available for this source type yet" until those fetchers ship, per Law 5).
7. **Firestore rules + index** — `comments` collection: `create: if request.auth != null && request.auth.uid == userId` (defense-in-depth; API is the real gate), `read: if true` (content is world-readable), `update: if false`, `delete: if false` (archive-only). New composite index: comments(contentId ASC, createdAt DESC, archived ASC) deployed via `firebase deploy --only firestore`.
8. **Nav/detail consistency** — watch page ISR 300s; comments API dynamic. The watch page renders the comment section client-side below server-rendered metadata.

Alternatives considered: (a) modal watch view — popups were explicitly rejected by the operator; (b) YouTube iframe API with comment mirroring — YouTube-hosted comments are out of our control and the Data API's comment endpoints cost quota per read; our own comments are product-owned; (c) URL-encoding full doc ids in routes (`/watch/youtube_abc`) — uglier; strip the `youtube_` prefix server-side instead (route stays `/watch/{videoId}`).

## Impact Analysis

- New: `app/watch/[videoId]/page.tsx`, `app/api/comments/route.ts`, `app/api/comments/[id]/route.ts`, `lib/repositories/comment-repo.ts`, `components/comments/CommentSection.tsx`.
- Modified: `lib/schemas/content.ts` (comment schema), `components/home/YouTubeEmbed.tsx` (links), `components/home/ContentCard.tsx` (title link), `firestore.rules`, `firestore.indexes.json`.
- New collection `comments`; one new composite index; rules deploy required.
- Blast radius: card interactions + one new public route + comments API. Home grid layout unchanged.

## Verification Plan (AUDIT)

- Method 1 (static): type-check + lint + build clean; route table lists `/watch/[videoId]`; rules file valid (firebase deploy dry-run or deploy).
- Method 2 (dynamic): `/watch/{real video id from the fetched Two Minute Papers content}` → 200 with player iframe, metadata, empty comment state; unknown id → not-found; POST comment unauthenticated → 401; signed-in POST → 201 + appears in GET; non-author DELETE → 403; author DELETE → 200 + archived (list excludes). Evidence via probe script (reuse admin-dashboard-verify session pattern).
- Call-graph reachability: `grep -rn "watch/" components/home/` → embed + card links; `grep -rn "comment-repo" app/api/` → API imports; `grep -rn "CommentSection" app/watch/` → page renders it.

## Perfection Loop Log

| Pass | Phase | Delta | Notes |
| ---- | ----- | ----- | ----- |
| 1 | RED → GREEN → AUDIT | — | Findings: (1) comment GET as world-readable must not leak emails beyond display name → store `userEmail` but render only the local-part or "user"; (2) ISR watch page would serve stale comment counts in metadata — metrics are fetch-time snapshots anyway (FID-003 contract); live counts come from the client-side comment list; (3) rules allow create only with matching uid claim, so a forged API bypass still cannot write others' comments; (4) route param sanitization: `[videoId]` validated against `^[A-Za-z0-9_-]+$` before doc-id construction. Converged. |

## Closure

Requires: implementation file:line, static gates, rules/index deploy evidence, boundary + happy-path comment probes, operator confirmation of the watch-page UX.

## Implementation Evidence (2026-09-03)

- Files: `app/watch/[videoId]/page.tsx` (charset-guarded param, 1-read doc lookup via `buildContentDocId`, embedded nocookie player, metadata, description, not-found state, `generateMetadata`), `lib/schemas/content.ts` (commentSchema), `lib/repositories/comment-repo.ts` (list/create/archive — the only comments writer), `app/api/comments/route.ts` (GET public / POST session-gated), `app/api/comments/[id]/route.ts` (author-or-admin archive), `components/comments/CommentSection.tsx` (client: live list, post, delete, sign-in prompt, email local-part display only).
- Wiring: play button + title in `YouTubeEmbed` are Links to `/watch/{videoId}`; grid thumbnails link too. FID-011's in-row playback and FID-007's modal both superseded.
- Firestore: comments rules (world-read; create only with `userId == auth.uid`; update/delete denied — API archives via Admin SDK) + composite index (contentId ASC, archived ASC, createdAt DESC) — `firebase deploy --only firestore:rules,firestore:indexes` → **Deploy complete**.
- Static: type-check + lint + build clean; route table: ƒ /watch/[videoId], ƒ /api/comments, ƒ /api/comments/[id].
- Dynamic: `scripts/watch-comments-verify.ts` — **15/15 PASS**: real video page renders player+metadata; unknown id → not-found; 401 anon POST; 201 signed-in; GET lists; 422 empty body; 404 unknown content; 403 non-author delete; author archive 200; archived excluded from list. (First run had 1 FAIL: composite index still building — re-run after build completed: all pass.)
- Status `verified`. Pending for `closed`: operator confirmation of watch-page UX.