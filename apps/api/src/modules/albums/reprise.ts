// Reprise des galeries d'avant (lot R9e, ARCHITECTURE-R8 § 1.10) : chaque galerie de `media_contents` (non supprimée) devient un album
// **publié** ; ses clés de photos sont réutilisées sur place (aucun fichier ne bouge), dans l'ordre. L'album garde l'identifiant de la
// galerie (`event_albums.id = media_contents.id`) : l'APK en ligne retrouve ses galeries par la façade. `featured_at` devient
// `official_at` pour **la galerie la plus récemment mise en avant de chaque événement** seulement (un seul album officiel). Puis la
// galerie reprise reçoit `deleted_at` (la façade la sert depuis l'album). Rejouée : rien ne bouge (il ne reste plus de galerie non
// supprimée, et les clés `legacy_media_content_id`, `storage_key` et `(album_id, position)` sont uniques).
//
// Ces instructions sont **les mêmes que la fin du fichier de migration `event-albums`** (écrites à la main après `db:generate`) :
// le seed les rejoue (les galeries du seed sont créées après la migration) et un test vérifie qu'elles n'ont pas dérivé.
import { sql } from "drizzle-orm";

import type { Executor } from "../../lib/tx";

export const REPRISE_STATEMENTS: readonly string[] = [
  `INSERT INTO "event_albums" ("id", "event_id", "media_profile_id", "author_id", "title", "allow_save", "official_at", "photos_count", "views", "status", "published_at", "legacy_media_content_id", "created_at", "updated_at")
SELECT mc."id", mc."event_id", mc."media_profile_id", mp."user_id", mc."title", false,
  CASE WHEN mc."featured_at" IS NOT NULL AND mc."id" = (
    SELECT f."id" FROM "media_contents" f
    WHERE f."event_id" = mc."event_id" AND f."kind" = 'gallery' AND f."deleted_at" IS NULL AND f."featured_at" IS NOT NULL
    ORDER BY f."featured_at" DESC, f."id" DESC LIMIT 1)
  THEN mc."featured_at" ELSE NULL END,
  cardinality(mc."photo_keys"), mc."views", 'published', mc."published_at", mc."id", mc."created_at", mc."updated_at"
FROM "media_contents" mc
JOIN "media_profiles" mp ON mp."id" = mc."media_profile_id"
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
ON CONFLICT DO NOTHING`,
  `INSERT INTO "event_album_photos" ("album_id", "storage_key", "position", "plate_state", "created_at", "updated_at")
SELECT a."id", k."key", (k."ord" - 1)::smallint, 'unknown', mc."created_at", mc."updated_at"
FROM "event_albums" a
JOIN "media_contents" mc ON mc."id" = a."legacy_media_content_id"
CROSS JOIN LATERAL unnest(mc."photo_keys") WITH ORDINALITY AS k("key", "ord")
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
ON CONFLICT DO NOTHING`,
  `UPDATE "event_albums" a SET "photos_count" = (SELECT count(*)::int FROM "event_album_photos" p WHERE p."album_id" = a."id" AND p."deleted_at" IS NULL)
WHERE a."legacy_media_content_id" IN (SELECT mc."id" FROM "media_contents" mc WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL)`,
  `UPDATE "media_contents" mc SET "deleted_at" = now()
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
  AND EXISTS (SELECT 1 FROM "event_albums" a WHERE a."legacy_media_content_id" = mc."id")`,
];

/** Rejoue la reprise (seed, tests). Rend le nombre de galeries reprises. */
export async function adoptLegacyGalleries(ex: Executor): Promise<number> {
  const res = await ex.execute(sql.raw(REPRISE_STATEMENTS[0] as string));
  for (const statement of REPRISE_STATEMENTS.slice(1)) await ex.execute(sql.raw(statement));
  return res.rowCount ?? 0;
}
