// Cible « photo d'un album » (lot R9e) : signalable par qui peut voir l'album (404 sinon, comme sa lecture). La modération voit la
// photo dans le dossier du signalement (`GET /admin/reports/:id/media/:name`, tracé, `no-store`). Retrait = photo retirée de
// l'album, fichier effacé après la validation, rangs et compteur ajustés ; si c'était la dernière photo, l'album est retiré aussi.
// Le propriétaire est le titulaire du profil média (sanctionnable) : il ne sait jamais qui a signalé.
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { eventAlbumPhotos, eventAlbums, mediaProfiles } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { photosHeldByReport, shiftPositions } from "../../albums/service";
import { loadAlbum } from "../../albums/view";
import { dropStoriesOfAlbumPhotos } from "../../stories/share";
import { registerReportMedia, reportMediaUrl } from "../media";
import { goneView, type TargetRules, UUID_RE } from "./types";

registerReportMedia("album_photo", async (report, name) => {
  if (!UUID_RE.test(report.targetId) || name !== `${report.targetId}.webp`) return null;
  const [photo] = await db
    .select({ key: eventAlbumPhotos.storageKey })
    .from(eventAlbumPhotos)
    .where(eq(eventAlbumPhotos.id, report.targetId));
  if (!photo) return null;
  const data = await storage.get(photo.key);
  return data ? { data, contentType: "image/webp" } : null;
});

export const albumPhotoTarget: TargetRules = {
  type: "album_photo",
  // Même verrou que les écritures de l'album (ajout, retrait, publication) : un seul à la fois.
  async lock(tx, targetId) {
    if (!UUID_RE.test(targetId)) return;
    const [photo] = await tx
      .select({ albumId: eventAlbumPhotos.albumId })
      .from(eventAlbumPhotos)
      .where(eq(eventAlbumPhotos.id, targetId));
    if (photo) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${photo.albumId}`}))`);
  },
  async resolve(v, targetId) {
    if (!UUID_RE.test(targetId)) throw notFound("Photo introuvable");
    const [photo] = await db
      .select({ albumId: eventAlbumPhotos.albumId })
      .from(eventAlbumPhotos)
      .where(and(eq(eventAlbumPhotos.id, targetId), isNull(eventAlbumPhotos.deletedAt)));
    const join = photo ? await loadAlbum(db, photo.albumId, v.user.id, now()) : null;
    if (!join) throw notFound("Photo introuvable");
    return { ownerId: join.m.userId };
  },
  async view(report) {
    if (!UUID_RE.test(report.targetId)) return goneView("Photo d'un album");
    const [row] = await db
      .select({ key: eventAlbumPhotos.storageKey, deletedAt: eventAlbumPhotos.deletedAt, media: mediaProfiles.name })
      .from(eventAlbumPhotos)
      .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
      .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId))
      .where(eq(eventAlbumPhotos.id, report.targetId));
    if (!row) return goneView("Photo d'un album");
    // Le nom dans l'adresse est l'identifiant de la photo (une photo reprise garde le nom de son ancienne clé, qui n'a pas la forme
    // attendue par la route des médias de modération) ; le fichier d'une photo retirée est gardé tant que le signalement attend.
    const url = reportMediaUrl(report.id, `${report.targetId}.webp`);
    // Le fichier a pu être effacé à la décision (aucun signalement ouvert ne le garde) : plus d'adresse vers un 404.
    const present = (await storage.size(row.key)) !== null;
    return {
      title: `Photo d'un album de ${row.media}`,
      text: null,
      imageUrl: present ? url : null,
      imageUrls: present ? [url] : [],
      link: null,
      gone: false,
      removed: Boolean(row.deletedAt),
    };
  },
  async remove(tx, _v, report) {
    if (!UUID_RE.test(report.targetId)) return [];
    const [seen] = await tx.select().from(eventAlbumPhotos).where(eq(eventAlbumPhotos.id, report.targetId));
    if (!seen) return [];
    // Le verrou de l'album, comme le retrait par le média et « En story » (lot R9f) : une photo retirée par la modération ne finit jamais
    // dans une story créée entre-temps (le partage tient aussi la ligne de la photo jusqu'à l'insertion).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${seen.albumId.toLowerCase()}`}))`);
    // La photo est relue **sous le verrou** : le média a pu la retirer pendant l'attente (positions jamais décalées deux fois, album retiré
    // seulement s'il n'a plus de photo).
    const [photo] = await tx
      .select()
      .from(eventAlbumPhotos)
      .where(eq(eventAlbumPhotos.id, report.targetId))
      .for("update");
    if (!photo) return [];
    // Déjà retirée par le média (fichier gardé pour la preuve) : la décision l'efface.
    if (photo.deletedAt) return [photo.storageKey];
    await tx.update(eventAlbumPhotos).set({ deletedAt: now() }).where(eq(eventAlbumPhotos.id, photo.id));
    // Lot R9f : les stories reprises de cette photo (« En story ») tombent ; leurs fichiers partent au balayage de `stories.expire`.
    await dropStoriesOfAlbumPhotos(tx, [photo.id]);
    await shiftPositions(tx, photo.albumId, photo.position);
    const [album] = await tx
      .update(eventAlbums)
      .set({ photosCount: sql`greatest(${eventAlbums.photosCount} - 1, 0)` })
      .where(eq(eventAlbums.id, photo.albumId))
      .returning({ count: eventAlbums.photosCount });
    // Plus aucune photo : l'album n'a plus de raison d'être servi.
    if (album && album.count === 0) {
      await tx
        .update(eventAlbums)
        .set({ deletedAt: now(), officialAt: null })
        .where(and(eq(eventAlbums.id, photo.albumId), isNull(eventAlbums.deletedAt)));
    }
    return [photo.storageKey];
  },
  // Retirée par le média pendant que le signalement attendait : le fichier était gardé pour la preuve ; une fois la dernière décision
  // prise sur cette photo, il part.
  async afterDecision(tx, report) {
    if (!UUID_RE.test(report.targetId)) return [];
    const [photo] = await tx.select().from(eventAlbumPhotos).where(eq(eventAlbumPhotos.id, report.targetId));
    if (!photo?.deletedAt) return [];
    if ((await photosHeldByReport(tx, [photo.id])).has(photo.id)) return [];
    return [photo.storageKey];
  },
};
