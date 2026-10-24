// Générateur d'affiche (lot 47, ARCHITECTURE-DA-V2 § 5.3) côté événement : photo d'affiche contrôlée, rendu des deux
// formats (Post 1080 × 1350, Story 1080 × 1920), clés écrites sur l'événement, aperçu en direct sans écriture.
// `poster_key` (affiche perso de l'organisateur) n'est jamais touchée ici.
import { randomBytes } from "node:crypto";
import {
  BUSINESS_TIMEZONE,
  type PosterFormat,
  type PosterPreview,
  type PosterSettings,
  posterStyles,
  yearToShow,
} from "@orasso/shared";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";

import { db } from "../../../db/client";
import { events, structures, uploads } from "../../../db/schema";
import { deps, now } from "../../../lib/deps";
import { validation } from "../../../lib/errors";
import { captureError } from "../../../lib/sentry";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import type { Tx } from "../../../lib/tx";
import { uploadsService } from "../../uploads/service";
import type { EventRow } from "../repo";
import { cachedRender, render } from "./render";
import type { PosterInput } from "./types";

/** Dossier des photos d'affiche envoyées par `POST /me/uploads` (public, comme les affiches). */
export const POSTER_PHOTO_PREFIX = "event-poster-photos/";

const photoUnknown = () => validation("Photo d'affiche introuvable : envoie-la d'abord.", { field: "poster.photoKey" });

export type PosterKeys = { postKey: string; storyKey: string };

async function logoOf(structureId: string | null | undefined): Promise<{ name: string; logo: Buffer | null }> {
  if (!structureId) return { name: "", logo: null };
  const s = await db.query.structures.findFirst({
    where: eq(structures.id, structureId),
    columns: { name: true, logoKey: true },
  });
  if (!s) return { name: "", logo: null };
  return { name: s.name, logo: s.logoKey ? await storage.get(s.logoKey) : null };
}

/** L'entrée du rendu pour un événement : sa date, sa ville, sa structure (nom, logo) et les réglages d'affiche. */
export async function eventPosterInput(
  e: Pick<EventRow, "startsAt" | "timezone" | "city" | "structureId">,
  settings: PosterSettings,
): Promise<PosterInput> {
  const [{ name, logo }, photo] = await Promise.all([
    logoOf(e.structureId),
    settings.photoKey ? storage.get(settings.photoKey) : Promise.resolve(null),
  ]);
  return {
    style: settings.style,
    title: settings.title,
    startsAt: e.startsAt,
    timezone: e.timezone,
    place: e.city ?? "",
    structureName: name,
    photo,
    logo,
  };
}

/**
 * Colonnes des réglages d'affiche. Les rendus en place restent jusqu'à ce qu'un nouveau rendu réussisse (`regenerate`
 * les remplace) ; seul le retrait de l'affiche (`null`) les efface.
 */
export function posterColumns(p: PosterSettings | null): Partial<typeof events.$inferInsert> {
  return {
    posterPhotoKey: p?.photoKey ?? null,
    posterStyle: p?.style ?? null,
    posterTitle: p?.title ?? null,
    ...(p ? {} : { posterPostKey: null, posterStoryKey: null }),
  };
}

/** Reprise d'un rendu échoué : cinq essais espacés (1 min, puis de plus en plus), une seule tâche en file par événement. */
export const POSTER_RENDER_JOB = { retryLimit: 5, retryDelay: 60, retryBackoff: true } as const;

/** Vrai si `next` (corps d'un PATCH) ne change rien aux réglages enregistrés. */
export function samePoster(next: PosterSettings | null | undefined, current: PosterSettings | null): boolean {
  if (next === undefined) return true;
  if (next === null || current === null) return next === current;
  return next.photoKey === current.photoKey && next.style === current.style && next.title === current.title;
}

/** Réglages d'affiche enregistrés sur un événement, ou `null` s'il n'a pas d'affiche générée. */
export function posterSettingsOf(e: EventRow): PosterSettings | null {
  const style = posterStyles.find((s) => s === e.posterStyle);
  if (!style || !e.posterTitle) return null;
  return { photoKey: e.posterPhotoKey, style, title: e.posterTitle };
}

/** L'année que l'affiche doit écrire maintenant (0 : aucune, l'événement est dans l'année en cours). */
export function posterYearOf(e: Pick<EventRow, "startsAt" | "timezone">, at: Date = now()): number {
  return yearToShow(e.startsAt, at, e.timezone) ?? 0;
}

/**
 * Lot R3b, tour 2 : l'affiche enregistrée n'écrit plus la bonne année (rendue avant le lot pour un événement de l'an
 * prochain, ou un Nouvel An est passé). Une clé sans marque d'année vaut « aucune année » : seules les affiches des
 * années suivantes sont refaites.
 */
export function posterYearStale(
  e: Pick<EventRow, "startsAt" | "timezone" | "posterPostKey" | "posterStyle" | "posterTitle">,
  at: Date = now(),
): boolean {
  if (!e.posterPostKey || !e.posterStyle || !e.posterTitle) return false;
  const stored = Number(/poster-post-y(\d+)-/.exec(e.posterPostKey)?.[1] ?? 0);
  return stored !== posterYearOf(e, at);
}

export const posterService = {
  /**
   * Contrôle la photo choisie pour l'affiche d'un événement, dans la transaction de l'appelant : celle déjà en place,
   * ou un envoi `event_poster_photo` de cette personne, rattaché ici (une seule fois).
   */
  async acceptPhoto(tx: Tx, v: Viewer, current: string | null, photoKey: string | null): Promise<void> {
    if (!photoKey || photoKey === current) return;
    if (!photoKey.startsWith(POSTER_PHOTO_PREFIX)) throw photoUnknown();
    const consumed = await uploadsService.consume(tx, v.user.id, photoKey, "event_poster_photo");
    if (!consumed) throw photoUnknown();
  },

  /** Rend les deux formats et les range ; rend les clés (l'appelant les écrit sur l'événement). */
  async renderForEvent(
    e: Pick<EventRow, "id" | "startsAt" | "timezone" | "city" | "structureId">,
    settings: PosterSettings,
  ): Promise<PosterKeys> {
    const input = await eventPosterInput(e, settings);
    const [post, story] = await Promise.all([render(input, "post"), render(input, "story")]);
    // Lot R3b, tour 2 : la clé dit l'année écrite sur l'affiche (`y0` : aucune), pour savoir quand la refaire.
    const tag = `y${posterYearOf(e)}-${randomBytes(6).toString("hex")}`;
    const postKey = `events/${e.id}/poster-post-${tag}.png`;
    const storyKey = `events/${e.id}/poster-story-${tag}.png`;
    await Promise.all([storage.put(postKey, post), storage.put(storyKey, story)]);
    return { postKey, storyKey };
  },

  /**
   * (Re)génère l'affiche d'un événement avec ses réglages enregistrés et écrit les clés, si les réglages n'ont pas
   * changé entre-temps ; les anciens rendus sont effacés. Rend l'événement à jour.
   */
  async regenerate(e: EventRow): Promise<EventRow> {
    const settings = posterSettingsOf(e);
    if (!settings) return e;
    const keys = await this.renderForEvent(e, settings);
    // Rendu périmé (date, ville, photo, style ou titre changés pendant le rendu) : il ne s'écrit pas.
    const [row] = await db
      .update(events)
      .set({ posterPostKey: keys.postKey, posterStoryKey: keys.storyKey })
      .where(
        and(
          eq(events.id, e.id),
          eq(events.posterStyle, settings.style),
          eq(events.posterTitle, settings.title),
          eq(events.startsAt, e.startsAt),
          e.city === null ? isNull(events.city) : eq(events.city, e.city),
          settings.photoKey === null ? isNull(events.posterPhotoKey) : eq(events.posterPhotoKey, settings.photoKey),
        ),
      )
      .returning();
    if (!row) {
      // Modifié pendant le rendu : ce rendu ne sert plus.
      await Promise.all([storage.remove(keys.postKey), storage.remove(keys.storyKey)]).catch(() => undefined);
      return (await db.query.events.findFirst({ where: eq(events.id, e.id) })) ?? e;
    }
    await this.removeRenders(e);
    return row;
  },

  /**
   * Rendu après un enregistrement : il ne fait **jamais** échouer la requête. En cas d'échec, l'erreur part vers
   * Sentry et une tâche `event.poster-render` reprend le rendu (pg-boss, essais espacés). Rend l'événement à jour.
   */
  async refresh(e: EventRow, userId?: string | null): Promise<EventRow> {
    try {
      return await this.regenerate(e);
    } catch (error) {
      captureError(error, userId);
      console.error(`Affiche de l'événement ${e.id} : rendu échoué, repris par une tâche.`, error);
      await this.schedule(e.id).catch((err) => captureError(err, userId));
      return e;
    }
  },

  /** Met le rendu de l'affiche d'un événement en file (une seule tâche en attente par événement). */
  schedule(eventId: string): Promise<void> {
    return deps.jobs.send("event.poster-render", { eventId }, undefined, {
      singletonKey: `poster:${eventId}`,
      ...POSTER_RENDER_JOB,
    });
  },

  /** Tâche `event.poster-render` : rend l'affiche avec les réglages du moment ; une erreur relance la reprise. */
  async renderJob(eventId: string): Promise<void> {
    const e = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    if (!e || !posterSettingsOf(e)) return;
    await this.regenerate(e);
  },

  /**
   * Nom ou logo d'une structure changé : ses affiches générées (événements ni annulés ni terminés) sont refaites, par
   * des tâches (la requête de l'organisateur n'attend pas).
   */
  async scheduleForStructure(structureId: string): Promise<number> {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.structureId, structureId),
          isNotNull(events.posterStyle),
          ne(events.status, "cancelled"),
          gt(events.endsAt, now()),
        ),
      );
    for (const r of rows) await this.schedule(r.id).catch((err) => captureError(err));
    return rows.length;
  },

  /** Efface les rendus d'un état précédent de l'événement (jamais l'affiche perso ni la photo). */
  async removeRenders(previous: Pick<EventRow, "posterPostKey" | "posterStoryKey">) {
    for (const key of [previous.posterPostKey, previous.posterStoryKey]) {
      if (key) await storage.remove(key).catch(() => undefined);
    }
  },

  /**
   * `POST /posters/preview` : aperçu en direct (PNG de 540 px au plus), rien n'est écrit. La photo est une photo
   * d'affiche envoyée par cette personne (rattachée ou non à un événement).
   */
  async preview(v: Viewer, input: PosterPreview): Promise<Buffer> {
    let photo: Buffer | null = null;
    if (input.photoKey) {
      if (!input.photoKey.startsWith(POSTER_PHOTO_PREFIX)) throw photoUnknown();
      const own = await db.query.uploads.findFirst({
        where: and(eq(uploads.key, input.photoKey), eq(uploads.userId, v.user.id)),
        columns: { key: true },
      });
      // Une photo déjà rattachée à un événement reste lisible (elle est publique) : l'organisateur qui rouvre
      // l'assistant d'un événement (ou de sa copie) revoit l'aperçu de son affiche.
      const allowed =
        Boolean(own) ||
        Boolean(
          await db.query.events.findFirst({ where: eq(events.posterPhotoKey, input.photoKey), columns: { id: true } }),
        );
      if (!allowed) throw photoUnknown();
      photo = await storage.get(input.photoKey);
      if (!photo) throw photoUnknown();
    }
    const { name, logo } = await logoOf(input.structureId);
    const format: PosterFormat = input.format;
    return cachedRender(
      {
        style: input.style,
        title: input.title,
        startsAt: input.date,
        timezone: BUSINESS_TIMEZONE,
        place: input.place,
        structureName: input.structureName || name,
        photo,
        logo,
      },
      format,
      input.width,
    );
  },
};
