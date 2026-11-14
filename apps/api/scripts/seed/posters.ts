// Lot 47 : créneaux d'arrivée et affiches générées (prototype DA v2, `s-create` étapes « Les arrivées » et « Ton
// affiche »). Nocturne de Canet : exposants 18 h 30 – 19 h 15 (strict, « Entrée côté capitainerie. Après 19 h 15,
// préviens l'équipe. »), public dès 19 h 30 (conseillé, « Parking visiteurs avenue de la Méditerranée. ») ; deux
// candidatures avec une note d'arrivée. Tous les événements du seed reçoivent une affiche générée (styles variés,
// photo de voiture réelle pour chacun (lot C5), un style sans photo n'étant qu'un aplat sombre) : toutes les cartes ont une vignette.
// Lot B3b : seulement les événements de la graine (jamais un événement réel), photo et style choisis par le slug ; une affiche
// sans photo, ou avec l'ancien dégradé factice, est refaite une seule fois ; ensuite rien ne bouge (idempotent).

import { createHash } from "node:crypto";
import { POSTER_TITLE_MAX, type PosterSettings, posterStyles } from "@orasso/shared";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { arrivalColumns } from "../../src/modules/events/arrivals";
import {
  POSTER_PHOTO_PREFIX,
  posterColumns,
  posterService,
  posterSettingsOf,
} from "../../src/modules/events/poster/service";
import type { EventRow } from "../../src/modules/events/repo";
import { demoEventPhotos, isLegacyFakePhoto, slugIndex } from "./photos";
import { isSeedEvent } from "./seed-scope";

const NOCTURNE_SLUG = "nocturne-de-canet-2026";
/** Événements de la graine volontairement sans affiche : le brouillon de l'organisateur (lot 52) et la sortie sans visuel (lot R8d). */
export const DRAFT_EVENT_SLUG = "expo-de-printemps-2027";
export const NO_VISUAL_EVENT_SLUG = "sortie-du-canigou-2026";
export const NO_POSTER_SLUGS = [DRAFT_EVENT_SLUG, NO_VISUAL_EVENT_SLUG] as const;

/** Titre d'affiche : le titre de l'événement, coupé au dernier mot entier s'il dépasse 34 caractères. */
export function posterTitleOf(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= POSTER_TITLE_MAX) return clean;
  const cut = clean.slice(0, POSTER_TITLE_MAX + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 10 ? cut.slice(0, space) : clean.slice(0, POSTER_TITLE_MAX)).trim();
}

/** `onlyEventIds` : ne génère l'affiche que de ces événements (le seed d'un événement précis ne refait pas celle d'un brouillon volontairement sans affiche). */
export async function seedPosters(onlyEventIds?: string[]) {
  // --- Créneaux de la Nocturne et notes d'arrivée -------------------------------------------------------------
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, NOCTURNE_SLUG) });
  if (nocturne && !nocturne.arrivalExhibitorsFrom) {
    await db
      .update(t.events)
      .set(
        arrivalColumns({
          exhibitors: {
            from: "18:30",
            to: "19:15",
            strict: true,
            note: "Entrée côté capitainerie. Après 19 h 15, préviens l'équipe.",
          },
          public: { from: "19:30", to: null, strict: false, note: "Parking visiteurs avenue de la Méditerranée." },
        }),
      )
      .where(eq(t.events.id, nocturne.id));
    // Les candidatures déjà là ont vu l'horaire ; deux d'entre elles laissent une note.
    await db
      .update(t.applications)
      .set({ arrivalSeenAt: sql`${t.applications.createdAt}` })
      .where(and(eq(t.applications.eventId, nocturne.id), eq(t.applications.kind, "vehicle")));
    const notes = ["J'arriverai vers 19 h 30 à cause du travail.", "Je viens de Narbonne, vers 18 h 45."];
    const firsts = await db
      .select({ id: t.applications.id })
      .from(t.applications)
      .where(
        and(
          eq(t.applications.eventId, nocturne.id),
          eq(t.applications.kind, "vehicle"),
          sql`${t.applications.status} in ('pending', 'accepted')`,
        ),
      )
      .orderBy(asc(t.applications.createdAt))
      .limit(notes.length);
    for (const [i, a] of firsts.entries()) {
      await db.update(t.applications).set({ arrivalNote: notes[i] }).where(eq(t.applications.id, a.id));
    }
  }

  // --- Affiches générées ------------------------------------------------------------------------------------------
  // Lot B3b : seulement les événements de la graine (preuve `isSeedEvent` : slug, propriétaire actif et créateur `@orasso.local`),
  // jamais un événement réel sans affiche. Les deux événements volontairement sans affiche (`NO_POSTER_SLUGS`) restent tels quels.
  const seedEvents = await db
    .select()
    .from(t.events)
    .where(
      and(
        isSeedEvent("events"),
        notInArray(t.events.slug, [...NO_POSTER_SLUGS]),
        onlyEventIds ? inArray(t.events.id, onlyEventIds) : undefined,
      ),
    )
    .orderBy(asc(t.events.startsAt));
  // Lot C5 (D34) : de vraies photos de voitures (celles de Damien, sinon les 7 de l'artefact), jamais le dégradé factice.
  const photos = await demoEventPhotos();
  let made = 0;
  let fixed = 0;
  for (const e of seedEvents) {
    try {
      const done = await posterOf(e, photos);
      if (done === "made") made++;
      if (done === "fixed") fixed++;
    } catch (error) {
      // Une affiche qui échoue ne laisse rien à moitié (la ligne n'est écrite qu'avec un rendu réussi) : le passage suivant la reprend.
      console.error(`Affiche de ${e.slug} : échec, reprise au prochain passage.`, error);
    }
  }
  if (!made && !fixed) console.log("Affiches des événements déjà générées.");
  else console.log(`Affiches générées : ${made} événements, refaites avec une vraie photo : ${fixed}.`);
}

type DemoPhoto = { name: string; data: Buffer };

/** Pose la photo d'affiche et le rendu d'un événement de la graine ; `null` si rien n'est à faire. */
async function posterOf(e: EventRow, photos: DemoPhoto[]): Promise<"made" | "fixed" | null> {
  const photo = photos.length ? photos[slugIndex(e.slug, photos.length)] : undefined;
  const hasPoster = Boolean(posterSettingsOf(e));
  let photoOk = false;
  if (hasPoster && e.posterPhotoKey) {
    // Une photo qui manque, ou l'ancien dégradé factice : à remplacer. Sans photo réelle à poser, on ne touche à rien.
    const stored = await storage.get(e.posterPhotoKey);
    photoOk = Boolean(stored) && !(await isLegacyFakePhoto(stored as Buffer));
  }
  if (hasPoster && e.posterPostKey && (photoOk || !photo)) return null;
  if (hasPoster && photoOk) {
    // Réglages et photo en place, mais pas de rendu (échec d'un passage précédent) : on le refait.
    await posterService.regenerate(e);
    return "fixed";
  }

  const style = posterStyles.find((s) => s === e.posterStyle) ?? styleOf(e.slug);
  let photoKey = photoOk ? e.posterPhotoKey : null;
  if (!photoKey && photo) {
    // Clé propre à l'octet près : une photo remplacée n'est jamais servie depuis un cache de l'ancienne.
    photoKey = `${POSTER_PHOTO_PREFIX}seed-${e.slug}-${createHash("sha1").update(photo.data).digest("hex").slice(0, 8)}.webp`;
    await storage.put(photoKey, photo.data);
  }
  const settings: PosterSettings = { photoKey, style, title: e.posterTitle ?? posterTitleOf(e.title) };
  // Le rendu d'abord : s'il échoue, la ligne reste telle quelle ; sinon réglages et rendus s'écrivent ensemble.
  const keys = await posterService.renderForEvent(e, settings);
  const [row] = await db
    .update(t.events)
    .set({ ...posterColumns(settings), posterPostKey: keys.postKey, posterStoryKey: keys.storyKey })
    .where(
      and(
        eq(t.events.id, e.id),
        sql`${t.events.posterPhotoKey} is not distinct from ${e.posterPhotoKey}`,
        sql`${t.events.posterStyle} is not distinct from ${e.posterStyle}`,
      ),
    )
    .returning();
  if (!row) {
    await Promise.all([storage.remove(keys.postKey), storage.remove(keys.storyKey)]).catch(() => undefined);
    return null;
  }
  await posterService.removeRenders(e);
  // L'ancienne photo de la graine (dégradé factice), plus servie par personne.
  if (e.posterPhotoKey && e.posterPhotoKey !== photoKey && e.posterPhotoKey.startsWith(`${POSTER_PHOTO_PREFIX}seed-`)) {
    await storage.remove(e.posterPhotoKey).catch(() => undefined);
  }
  return hasPoster ? "fixed" : "made";
}

/** La Nocturne en Néon (style par défaut du prototype), les autres selon leur slug (stable d'un passage à l'autre). */
function styleOf(slug: string): PosterSettings["style"] {
  if (slug === NOCTURNE_SLUG) return "neon";
  return posterStyles[slugIndex(slug, posterStyles.length)] ?? "neon";
}
