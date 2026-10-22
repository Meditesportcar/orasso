// Lot 47 : créneaux d'arrivée et affiches générées (prototype DA v2, `s-create` étapes « Les arrivées » et « Ton
// affiche »). Nocturne de Canet : exposants 18 h 30 – 19 h 15 (strict, « Entrée côté capitainerie. Après 19 h 15,
// préviens l'équipe. »), public dès 19 h 30 (conseillé, « Parking visiteurs avenue de la Méditerranée. ») ; deux
// candidatures avec une note d'arrivée. Tous les événements du seed reçoivent une affiche générée (styles variés,
// photo de voiture réelle pour chacun (lot C5), un style sans photo n'étant qu'un aplat sombre) : toutes les cartes ont une vignette. Idempotent : un
// événement qui a déjà une affiche générée n'est pas refait.
import { POSTER_TITLE_MAX, type PosterSettings, posterStyles } from "@orasso/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { arrivalColumns } from "../../src/modules/events/arrivals";
import { POSTER_PHOTO_PREFIX, posterColumns, posterService } from "../../src/modules/events/poster/service";
import { demoEventPhotos } from "./photos";

const NOCTURNE_SLUG = "nocturne-de-canet-2026";

/** Titre d'affiche : le titre de l'événement, coupé au dernier mot entier s'il dépasse 34 caractères. */
export function posterTitleOf(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= POSTER_TITLE_MAX) return clean;
  const cut = clean.slice(0, POSTER_TITLE_MAX + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 10 ? cut.slice(0, space) : clean.slice(0, POSTER_TITLE_MAX)).trim();
}

export async function seedPosters() {
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
  const todo = await db.query.events.findMany({
    where: isNull(t.events.posterStyle),
    orderBy: [asc(t.events.startsAt)],
  });
  if (!todo.length) {
    console.log("Affiches des événements déjà générées.");
    return;
  }
  // Lot C5 (D34) : de vraies photos de voitures (celles de Damien, sinon les 7 de l'artefact), jamais le dégradé factice.
  const photos = await demoEventPhotos();
  let made = 0;
  for (const [i, e] of todo.entries()) {
    // La Nocturne en Néon (style par défaut du prototype), les autres à tour de rôle.
    const style = e.slug === NOCTURNE_SLUG ? "neon" : posterStyles[i % posterStyles.length];
    if (!style) continue;
    let photoKey: string | null = null;
    const photo = photos.length ? photos[i % photos.length] : undefined;
    if (photo) {
      // Sous le dossier des photos d'affiche (comme un envoi `event_poster_photo`).
      photoKey = `${POSTER_PHOTO_PREFIX}seed-${e.slug}.webp`;
      await storage.put(photoKey, photo.data);
    }
    const settings: PosterSettings = { photoKey, style, title: posterTitleOf(e.title) };
    const [row] = await db.update(t.events).set(posterColumns(settings)).where(eq(t.events.id, e.id)).returning();
    if (row) {
      await posterService.regenerate(row);
      made++;
    }
  }
  console.log(`Affiches générées : ${made} événements.`);
}
