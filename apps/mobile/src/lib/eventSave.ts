// Enregistrement de l'assistant d'événement de l'appli (lot 35b), même enchaînement que le site (`EventWizard.save`) :
// l'événement (POST ou PATCH), puis ses jours (lot 26), puis ses zones, puis l'affiche. Correctif du lot 26 conservé :
// un événement créé dont l'enregistrement des jours a échoué passe en modification (pas de second POST), et un
// événement existant sur plusieurs jours part sans dates dans le PATCH (une seule notification « Événement modifié »,
// celle des jours). Les appels passent par `api` : ce fichier ne décide d'aucune règle de l'API.
import {
  type EventDraft,
  type EventOrganizer,
  eventDaysPayload,
  eventPayload,
  eventEditorLabels as L,
  zoneChanges,
} from "@orasso/shared";

import type { api } from "./api";
import { firstAppProblem } from "./eventDraft";

export type EventEditorApi = Pick<
  typeof api,
  "createEvent" | "updateEvent" | "putEventDays" | "addZone" | "updateZone" | "deleteZone" | "uploadPoster"
>;

export type SaveInput = {
  structureId: string;
  draft: EventDraft;
  /** Événement modifié (absent à la création). */
  event?: EventOrganizer;
  /** Événement déjà créé lors d'un essai précédent (jours refusés) : la suite le modifie. */
  createdId: string | null;
  /** Affiche choisie, prête à envoyer (`FormData` avec le champ « poster »). */
  poster: FormData | null;
};

export type SaveResult =
  | { ok: true; event: EventOrganizer; warnings: string[] }
  /** `index` : l'écran à rouvrir ; `error` : l'erreur de l'API (message, double authentification) ou un texte. */
  | { ok: false; index: number; error: unknown; createdId: string | null };

/** Écran des dates, où l'on revient quand l'API refuse les jours. */
const DATES_INDEX = 1;

export async function saveEvent(client: EventEditorApi, input: SaveInput): Promise<SaveResult> {
  const { draft: d, event, structureId } = input;
  const invalid = firstAppProblem(d);
  if (invalid) return { ok: false, index: invalid.index, error: invalid.problem, createdId: input.createdId };

  const targetId = event?.id ?? input.createdId;
  const wasMultiDay = (event?.days.length ?? 0) > 1;
  try {
    // Retour à un seul jour d'un événement qui en avait plusieurs : les jours d'abord (les dates suivent).
    if (event && wasMultiDay && !d.multiDay) await client.putEventDays(event.id, eventDaysPayload(d));
  } catch (error) {
    return { ok: false, index: DATES_INDEX, error, createdId: input.createdId };
  }

  let saved: EventOrganizer;
  try {
    const body = eventPayload(d, Boolean(targetId) && d.multiDay);
    saved = targetId ? await client.updateEvent(targetId, body) : await client.createEvent(structureId, body);
  } catch (error) {
    return { ok: false, index: 0, error, createdId: input.createdId };
  }

  if (d.multiDay) {
    try {
      await client.putEventDays(saved.id, eventDaysPayload(d));
    } catch (error) {
      return { ok: false, index: DATES_INDEX, error, createdId: event ? null : saved.id };
    }
  }

  const warnings: string[] = [];
  const zones = zoneChanges(event?.zones ?? [], d.zones);
  const zoneCalls = [
    ...zones.remove.map((id) => () => client.deleteZone(saved.id, id)),
    ...zones.update.map((z) => () => client.updateZone(saved.id, z.id, z.zone)),
    ...zones.create.map((zone) => () => client.addZone(saved.id, zone)),
  ];
  let zoneFailed = false;
  for (const call of zoneCalls) {
    try {
      await call();
    } catch {
      zoneFailed = true;
    }
  }
  if (zoneFailed) warnings.push(L.savedPartly(L.zonesFailed));

  if (input.poster) {
    try {
      await client.uploadPoster(saved.id, input.poster);
    } catch {
      warnings.push(L.savedPartly(L.posterFailed));
    }
  }
  return { ok: true, event: saved, warnings };
}
