// Reprise des annonces publiques d'un événement en publications (vague R8, lot R8d, décisions T1 et T3 de Damien, 11/11).
// À lancer **une fois au déploiement** de la livraison 2, après la sauvegarde de la base et les migrations (0081), puis à
// chaque déploiement suivant si l'ancien APK a encore créé des annonces. Rejouable : une annonce déjà reprise n'est jamais
// reprise deux fois (`feed_posts.legacy_announcement_id`, unique).
//
//   pnpm --filter @orasso/api exec tsx scripts/announcements-to-posts.ts --dry-run   (ne rien écrire : compter)
//   pnpm --filter @orasso/api exec tsx scripts/announcements-to-posts.ts             (la reprise)
//   pnpm --filter @orasso/api exec tsx scripts/announcements-to-posts.ts --revert    (retirer les publications reprises)
//
// Ce que la reprise fait pour chaque annonce `announcement` / `public` non supprimée :
//   - avec image : une publication avec **une photo**, le fichier étant **copié** sous la clé d'une publication (une image
//     d'annonce est sous une clé publique `announcements/…` que la route des photos d'une publication ne sait pas servir) ;
//   - sans image, sur un événement qui a une affiche ou une photo : une publication sans photo (l'affiche fait le visuel) ;
//   - sans image et sans visuel : **elle reste une annonce** (T1 : pas de publication sans visuel) ;
//   - auteur disparu ou banni : le propriétaire actif de la structure, à défaut elle reste une annonce.
// Ne sont pas reprises non plus (la publication ne serait pas lisible de la fiche) : un événement brouillon ou sur
// invitation, une structure supprimée, suspendue ou non vérifiée (un visiteur sans session ne verrait pas son journal).
// **Aucune notification, aucune annonce modifiée ni supprimée.** Une transaction par annonce, le fichier copié avant et
// effacé si elle échoue. Les annonces réservées aux inscrits, les consignes et les changements de statut ne bougent pas.
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { FEED_ASPECT_RATIOS, type FeedAspect } from "@orasso/shared";
import { isNotNull, sql } from "drizzle-orm";
import sharp from "sharp";

import { db, pool } from "../src/db/client";
import { feedPostPhotos, feedPosts } from "../src/db/schema";
import { storage } from "../src/lib/storage";
import { feedPhotoKey } from "../src/modules/feed/posts";
import { removeOrRetry } from "../src/modules/vehicles/photos-blur";

export type RepriseStats = {
  dryRun: boolean;
  /** Annonces publiques non supprimées lues. */
  read: number;
  /** Déjà reprises (rien de plus). */
  alreadyMigrated: number;
  /** Reprises avec leur image. */
  withImage: number;
  /** Reprises sans image, avec l'affiche de l'événement. */
  withPoster: number;
  /** Restées une annonce : ni image ni affiche. */
  keptNoVisual: number;
  /** Restées une annonce : auteur disparu et aucun propriétaire actif. */
  keptNoAuthor: number;
  /** Restées une annonce : événement brouillon ou sur invitation, structure supprimée, suspendue ou non vérifiée. */
  keptNotServed: number;
  /** Supprimées pendant le passage (ancien APK) : rien n'est repris. */
  deletedDuring: number;
  /** Dont l'image avait disparu du stockage (reprises avec l'affiche, ou restées faute de visuel). */
  imageMissing: number;
  /** Publications épinglées par la reprise (une par événement au plus). */
  pinned: number;
  /** Échecs d'une annonce (la suivante continue ; rien n'est écrit pour celle-ci). */
  failed: number;
  postsBefore: number;
  postsAfter: number;
};

export type RevertStats = {
  dryRun: boolean;
  posts: number;
  files: number;
  detached: number;
  postsBefore: number;
  postsAfter: number;
};

type Row = {
  id: string;
  event_id: string;
  author_id: string | null;
  body: string;
  image_key: string | null;
  image_width: number | null;
  image_height: number | null;
  pinned: boolean;
  notified: boolean;
  /** Texte ou date selon le pilote : toujours relu par `new Date`. */
  published_at: Date | string;
  structure_id: string;
  department: string | null;
  event_status: string;
  admission: string;
  has_visual: boolean;
  verification: string;
  structure_deleted: boolean;
  migrated_post_id: string | null;
};

/** Le format le plus proche des trois, par le rapport largeur / hauteur (échelle logarithmique : 1,6 est plus près du paysage). */
export function nearestAspect(width: number, height: number): FeedAspect {
  const ratio = Math.log(width / height);
  let best: FeedAspect = "portrait_4_5";
  let gap = Number.POSITIVE_INFINITY;
  for (const [aspect, target] of Object.entries(FEED_ASPECT_RATIOS) as [FeedAspect, number][]) {
    const g = Math.abs(ratio - Math.log(target));
    if (g < gap) {
      gap = g;
      best = aspect;
    }
  }
  return best;
}

const countPosts = async (): Promise<number> => {
  const res = await db.execute<{ n: number }>(sql`select count(*)::int as n from feed_posts where deleted_at is null`);
  return Number(res.rows[0]?.n ?? 0);
};

/** Auteur de la publication : celui de l'annonce s'il est encore en règle, sinon le propriétaire actif de la structure. */
async function authorFor(row: Row): Promise<string | null> {
  const res = await db.execute<{ user_id: string }>(sql`select user_id from (
      select p.user_id, 0 as rank from profiles p where p.user_id = ${row.author_id} and p.banned_at is null and p.deleted_at is null
      union all
      select m.user_id, 1 as rank from structure_members m join profiles p on p.user_id = m.user_id
        where m.structure_id = ${row.structure_id} and m.role = 'owner' and m.status = 'active'
          and p.banned_at is null and p.deleted_at is null
    ) t order by rank limit 1`);
  return res.rows[0]?.user_id ?? null;
}

/**
 * La reprise. `dryRun` : compte ce qu'elle ferait, n'écrit **aucune ligne et aucun fichier**. Les annonces sont traitées de la
 * plus ancienne à la plus récente ; l'épinglée est la plus récente des annonces épinglées de l'événement (une seule par
 * événement, et seulement si l'événement n'a pas déjà une publication épinglée).
 */
export async function announcementsToPosts(opts: { dryRun?: boolean } = {}): Promise<RepriseStats> {
  const dryRun = opts.dryRun === true;
  const stats: RepriseStats = {
    dryRun,
    read: 0,
    alreadyMigrated: 0,
    withImage: 0,
    withPoster: 0,
    keptNoVisual: 0,
    keptNoAuthor: 0,
    keptNotServed: 0,
    deletedDuring: 0,
    imageMissing: 0,
    pinned: 0,
    failed: 0,
    postsBefore: await countPosts(),
    postsAfter: 0,
  };
  const rows = (
    await db.execute<Row>(sql`select a.id, a.event_id, a.author_id, a.body, a.image_key, a.image_width, a.image_height,
        a.pinned, a.notified, a.published_at,
        e.structure_id, e.department, e.status as event_status, e.admission,
        (coalesce(e.poster_post_key, e.poster_key, e.poster_photo_key) is not null) as has_visual,
        s.verification, (s.deleted_at is not null) as structure_deleted,
        (select p.id from feed_posts p where p.legacy_announcement_id = a.id) as migrated_post_id
      from event_announcements a
      join events e on e.id = a.event_id
      join structures s on s.id = e.structure_id
      where a.kind = 'announcement' and a.audience = 'public' and a.deleted_at is null
      order by a.published_at asc, a.created_at asc, a.id asc`)
  ).rows;
  stats.read = rows.length;

  // L'épinglée de chaque événement : la plus récente des annonces épinglées (reprises ou non, pour que le choix ne change
  // pas d'un passage à l'autre).
  const winnerOf = new Map<string, string>();
  for (const r of rows) if (r.pinned) winnerOf.set(r.event_id, r.id);
  // Les fiches qui ont déjà une publication épinglée la gardent (une seule par fiche : index unique).
  const alreadyPinned = new Set(
    (
      await db.execute<{ event_id: string }>(
        sql`select distinct event_id from feed_posts where pinned_at is not null and deleted_at is null and event_id is not null`,
      )
    ).rows.map((r) => r.event_id),
  );

  for (const row of rows) {
    if (row.migrated_post_id) {
      stats.alreadyMigrated += 1;
      continue;
    }
    if (
      row.event_status === "draft" ||
      row.admission === "invite_only" ||
      row.structure_deleted ||
      row.verification !== "verified"
    ) {
      stats.keptNotServed += 1;
      continue;
    }
    // Une image qui a disparu du stockage ne fait pas de publication : l'affiche prend le relais si elle existe.
    let image: { width: number; height: number } | null = null;
    if (row.image_key) {
      const data = await storage.get(row.image_key);
      if (data) {
        let width = row.image_width;
        let height = row.image_height;
        if (!(width && height)) {
          const meta = await sharp(data).metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
        }
        if (width && height) image = { width, height };
      }
      if (!image) stats.imageMissing += 1;
    }
    if (!image && !row.has_visual) {
      stats.keptNoVisual += 1;
      continue;
    }
    const authorId = await authorFor(row);
    if (!authorId) {
      stats.keptNoAuthor += 1;
      continue;
    }
    if (dryRun) {
      if (image) stats.withImage += 1;
      else stats.withPoster += 1;
      if (winnerOf.get(row.event_id) === row.id && !alreadyPinned.has(row.event_id)) stats.pinned += 1;
      continue;
    }
    // Fichier copié avant la transaction, effacé si elle échoue (ou si une autre exécution a repris l'annonce entre-temps).
    const postId = randomUUID();
    const photoKey = image ? feedPhotoKey(postId, randomBytes(16).toString("hex")) : null;
    try {
      if (photoKey && row.image_key) await storage.copy(row.image_key, photoKey);
      const pinnedHere = await db.transaction(async (tx) => {
        let pin = false;
        // Même verrou que l'épinglage en direct (`pin.ts`) : une course avec lui ne fait pas échouer la transaction.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pin:${row.event_id}`}))`);
        // L'annonce est relue **sous verrou** : supprimée pendant le passage (ancien APK), elle n'est pas reprise. Le retrait de la
        // façade verrouille lui aussi l'annonce : les deux chemins se suivent.
        const alive = await tx.execute(
          sql`select 1 from event_announcements where id = ${row.id} and deleted_at is null for update`,
        );
        if (!alive.rows.length) return "gone" as const;
        if (winnerOf.get(row.event_id) === row.id) {
          const taken = await tx.execute(
            sql`select 1 from feed_posts where event_id = ${row.event_id} and pinned_at is not null and deleted_at is null limit 1`,
          );
          pin = taken.rows.length === 0;
        }
        const at = new Date(row.published_at);
        const inserted = await tx
          .insert(feedPosts)
          .values({
            id: postId,
            authorId,
            persona: "organizer",
            structureId: row.structure_id,
            eventId: row.event_id,
            eventRole: "organizer",
            caption: row.body,
            department: row.department ?? "",
            aspect: image ? nearestAspect(image.width, image.height) : "portrait_4_5",
            pinnedAt: pin ? at : null,
            importantReason: row.notified ? "other" : null,
            importantSentAt: row.notified ? at : null,
            legacyAnnouncementId: row.id,
            createdAt: at,
            updatedAt: at,
          })
          .onConflictDoNothing()
          .returning({ id: feedPosts.id });
        if (!inserted.length) return null;
        if (photoKey && image) {
          await tx.insert(feedPostPhotos).values({
            postId,
            storageKey: photoKey,
            width: image.width,
            height: image.height,
            position: 0,
            // Image d'organisateur (affiche, programme) : aucune décision de plaque à prendre (règle R7f4).
            plateBlurred: false,
            noPlateConfirmed: true,
          });
        }
        return pin;
      });
      if (pinnedHere === "gone") {
        if (photoKey) await storage.remove(photoKey).catch(() => undefined);
        stats.deletedDuring += 1;
        continue;
      }
      if (pinnedHere === null) {
        // Reprise par un autre passage entre-temps : rien de plus, le fichier copié ne sert à rien.
        if (photoKey) await storage.remove(photoKey).catch(() => undefined);
        stats.alreadyMigrated += 1;
        continue;
      }
      if (image) stats.withImage += 1;
      else stats.withPoster += 1;
      if (pinnedHere) stats.pinned += 1;
    } catch (error) {
      if (photoKey) await storage.remove(photoKey).catch(() => undefined);
      stats.failed += 1;
      console.error(`[orasso] annonce ${row.id} : reprise impossible, elle reste une annonce.`, error);
    }
  }
  stats.postsAfter = dryRun ? stats.postsBefore + stats.withImage + stats.withPoster : await countPosts();
  return stats;
}

/**
 * Retire les publications reprises (lignes, photos copiées, flammes et commentaires par cascade) : l'état d'avant. Les annonces
 * d'origine et leurs images n'ont jamais bougé. Les publications reprises puis retirées à la main sont retirées aussi.
 */
export async function revertAnnouncementsToPosts(opts: { dryRun?: boolean } = {}): Promise<RevertStats> {
  const dryRun = opts.dryRun === true;
  const postsBefore = await countPosts();
  const posts = await db.select({ id: feedPosts.id }).from(feedPosts).where(isNotNull(feedPosts.legacyAnnouncementId));
  const photos = posts.length
    ? (
        await db.execute<{ storage_key: string }>(
          sql`select ph.storage_key from feed_post_photos ph join feed_posts p on p.id = ph.post_id where p.legacy_announcement_id is not null`,
        )
      ).rows
    : [];
  const reported = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from feed_posts p where p.legacy_announcement_id is not null
      and exists (select 1 from reports r where r.target_type = 'feed_post' and r.target_id = p.id::text)`,
  );
  if (dryRun) {
    const live = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from feed_posts where legacy_announcement_id is not null and deleted_at is null`,
    );
    return {
      dryRun,
      posts: posts.length,
      files: photos.length,
      detached: Number(reported.rows[0]?.n ?? 0),
      postsBefore,
      postsAfter: postsBefore - Number(live.rows[0]?.n ?? 0),
    };
  }
  // **Une seule transaction** : les reprises verrouillées, puis rien ne reste à demi (ni notification effacée avec une publication
  // encore en ligne, ni signalement arrivé entre deux requêtes). Un signalement n'est **jamais** supprimé (sanctions contestées,
  // captures) : une reprise visée par un signalement est retirée en douceur (`deleted_at`, photos gardées pour la modération) et
  // **détachée** (`legacy_announcement_id` remis à nul : l'annonce d'origine est de nouveau servie). Les autres sont supprimées
  // avec leurs notifications. Perdu avec elles : les flammes et les commentaires reçus depuis la reprise. Fichiers ensuite.
  const keys: string[] = [];
  let detached = 0;
  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string; reported: boolean }>(
      sql`select p.id, exists (select 1 from reports r where r.target_type = 'feed_post' and r.target_id = p.id::text) as reported
        from feed_posts p where p.legacy_announcement_id is not null order by p.id for update`,
    );
    const keep = locked.rows.filter((r) => r.reported).map((r) => r.id);
    const drop = locked.rows.filter((r) => !r.reported).map((r) => r.id);
    if (keep.length) {
      const list = sql.join(
        keep.map((i) => sql`${i}::uuid`),
        sql`, `,
      );
      await tx.execute(
        sql`update feed_posts set deleted_at = coalesce(deleted_at, now()), legacy_announcement_id = null where id in (${list})`,
      );
      await tx.execute(sql`delete from feed_post_reactions where post_id in (${list})`);
      await tx.execute(
        sql`delete from notifications where data ->> 'postId' in (select id::text from feed_posts where id in (${list}))`,
      );
      detached = keep.length;
    }
    if (drop.length) {
      const list = sql.join(
        drop.map((i) => sql`${i}::uuid`),
        sql`, `,
      );
      const ph = await tx.execute<{ storage_key: string }>(
        sql`select storage_key from feed_post_photos where post_id in (${list})`,
      );
      keys.push(...ph.rows.map((r) => r.storage_key));
      await tx.execute(
        sql`delete from notifications where data ->> 'postId' in (select id::text from feed_posts where id in (${list}))`,
      );
      await tx.execute(sql`delete from feed_posts where id in (${list})`);
    }
  });
  for (const key of keys) await removeOrRetry(key);
  return { dryRun, posts: posts.length, files: keys.length, detached, postsBefore, postsAfter: await countPosts() };
}

/** Le compte rendu, en clair (pour Damien). */
export function describeReprise(s: RepriseStats): string {
  const lines = [
    `${s.dryRun ? "[À BLANC : rien n'est écrit] " : ""}${s.read} annonce(s) publique(s) lue(s)`,
    `  - ${s.withImage} reprise(s) avec leur image (fichier copié)`,
    `  - ${s.withPoster} reprise(s) avec l'affiche de l'événement`,
    `  - ${s.keptNoVisual} restée(s) annonce(s) faute de visuel (ni image, ni affiche, ni photo de l'événement)`,
    `  - ${s.keptNoAuthor} restée(s) annonce(s) faute d'auteur (aucun propriétaire actif)`,
    `  - ${s.keptNotServed} restée(s) annonce(s) : événement brouillon ou sur invitation, structure supprimée, suspendue ou non vérifiée`,
    `  - ${s.deletedDuring} supprimée(s) pendant la reprise (non reprises)`,
    `  - ${s.alreadyMigrated} déjà reprise(s)`,
    `  - dont ${s.pinned} épinglée(s) en tête de leur fiche ; ${s.imageMissing} image(s) disparue(s) du stockage ; ${s.failed} échec(s)`,
    `Publications : ${s.postsBefore} avant, ${s.postsAfter} ${s.dryRun ? "après (prévu)" : "après"}.`,
  ];
  return lines.join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const started = Date.now();
  if (args.has("--revert")) {
    const s = await revertAnnouncementsToPosts({ dryRun });
    console.log(
      `${dryRun ? "[À BLANC : rien n'est écrit] " : ""}Retrait : ${s.posts} publication(s) reprise(s) (dont ${s.detached} gardée(s) en retrait doux, détachée(s) : un signalement les vise), ${s.files} fichier(s) copié(s). Publications : ${s.postsBefore} avant, ${s.postsAfter} après${dryRun ? " (prévu)" : ""}.`,
    );
  } else {
    console.log(describeReprise(await announcementsToPosts({ dryRun })));
  }
  console.log(`Durée : ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error("[orasso] ERREUR : reprise des annonces impossible :", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
