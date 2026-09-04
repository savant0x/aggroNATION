#!/usr/bin/env bash
# ============================================================================
# Firebase removal cleanup (FID-2026-0904-010, final step).
#
# Run ONLY after scripts/migrate-firestore-to-supabase.ts has completed
# successfully (Firestore is the read source — deleting the SDK first would
# strand the migration). Removes:
#   - the firebase client/admin modules and the Firestore-era scripts
#   - firestore rules/indexes/hosting config + leftover idtoken.tmp
#   - the firebase npm dependencies
#   - the firebase block in .env.local
# Then re-runs the gates.
#
#   bash scripts/cleanup-remove-firebase.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/5 deleting lib/firebase + Firestore-era scripts =="
rm -rf lib/firebase
# Firestore-era scripts (historical; their knowledge lives in FIDs/summaries).
rm -f scripts/migrate-firestore-to-supabase.ts \
      scripts/migrate-osp-opensource.ts \
      scripts/adc-probe.ts \
      scripts/admin-dashboard-verify.ts \
      scripts/auth-crud-verify.ts \
      scripts/auth-registration-verify.ts \
      scripts/backfill-source-names.ts \
      scripts/cookie-probe.ts \
      scripts/data-layer-verify.ts \
      scripts/fetch-service-verify.ts \
      scripts/fid016-bulk-verify.ts \
      scripts/fid017-edit-delete-verify.ts \
      scripts/fid018-rss-verify.ts \
      scripts/fid022-fetchers-verify.ts \
      scripts/fid022-mint-token.ts \
      scripts/fid022-preclean.ts \
      scripts/live-fetch-verify.ts \
      scripts/probe-source-state.ts \
      scripts/probe-srcsort.ts \
      scripts/probe-visual-admin.ts \
      scripts/purge-x-sources.ts \
      scripts/query-probe.ts \
      scripts/remove-x-sources.ts \
      scripts/repair-source-name-whitespace.ts \
      scripts/sweep-enable-sources.ts \
      scripts/watch-comments-verify.ts
echo "   done"

echo "== 2/5 deleting firestore config + leftovers =="
rm -f firestore.rules firestore.indexes.json firebase.json .firebaserc idtoken.tmp
echo "   done"

echo "== 3/5 removing firebase npm dependencies =="
npm uninstall firebase firebase-admin 2>&1 | tail -1

echo "== 4/5 stripping the firebase block from .env.local =="
if [ -f .env.local ]; then
  cp .env.local .env.local.bak
  # Remove the Firebase web-config + admin comment blocks and any remaining
  # NEXT_PUBLIC_FIREBASE_* lines, keeping everything else intact.
  sed -i '/^# Firebase (web SDK config/,/^NEXT_PUBLIC_FIREBASE_APP_ID=/d' .env.local
  sed -i '/^NEXT_PUBLIC_FIREBASE_/d; /^FIREBASE_ADMIN_/d; /^NEXT_PUBLIC_USE_FIREBASE_EMULATORS=/d' .env.local
  # Drop now-empty comment lines left behind.
  sed -i '/^[[:space:]]*#[[:space:]]*$/d' .env.local
  echo "   backup kept at .env.local.bak"
fi

echo "== 5/5 gates =="
npm run type-check && npm run lint && npm run build
echo "== Cleanup complete. Delete .env.local.bak once you confirm the site works. =="
