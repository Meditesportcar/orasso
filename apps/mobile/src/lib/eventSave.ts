// Enregistrement de l'assistant d'événement de l'appli (lot 35b ; lot 53 : à chaque temps d'un brouillon), même
// enchaînement que le site (`EventWizard.persist`) : l'événement (POST ou PATCH ; l'affiche générée est rendue par l'API
// avec ses réglages), ses jours (lot 26), ses zones, ses missions (lot 46), l'affiche perso ; puis l'événement et ses
// missions sont relus (identifiants des zones et des missions créées). Correctif du lot 26 conservé : un événement
// créé dont l'enregistrement des jours a échoué passe en modification (pas de second POST), et un événement existant
// sur plusieurs jours part sans dates dans le PATCH. Les appels passent par `api` : aucune règle de l'API ici.
import {
  type EventDraft,
  type EventNeedView,
  type EventOrganizer,
  type EventWizardStep,
  eventDaysPayload,
  eventPayload,
  firstEventProblem,
  eventEditorLabels as L,
  needChanges,
  zoneChanges,
} from "@orasso/shared";

import type { api } from "./api";

export type EventEditorApi = Pick<
  typeof api,
  | "createEvent"
  | "updateEvent"
  | "putEventDays"
  | "addZone"
  | "updateZone"
  | "deleteZone"
  | "uploadPoster"
  | "addNeed"
  | "updateNeed"
  | "deleteNeed"
  | "orgEvent"
  | "eventNeeds"
>;

export type SaveInput = {
  structureId: string;
  draft: EventDraft;
  /** Événement enregistré (absent avant la première fois). */
  event?: EventOrganizer;
  /** Missions enregistrées (comparées à celles du brouillon). */
  savedNeeds?: readonly EventNeedView[];
  /** Événement déjà créé lors d'un essai précédent (jours refusés) : la suite le modifie. */
  createdId: string | null;
  /** Affiche perso choisie, prête à envoyer (`FormData` avec le champ « poster »). */
  poster: FormData | null;
  /** Vérifie tous les temps avant d'envoyer (fin de l'assistant). */
  validate?: boolean;
};

export type SaveResult =
  | { ok: true; event: EventOrganizer; needs: EventNeedView[]; warnings: string[] }
  /** `step` : le temps à rouvrir ; `error` : l'erreur de l'API (message, double authentification) ou un texte. */
  | { ok: false; step: EventWizardStep; error: unknown; createdId: string | null };

export async function saveEvent(client: EventEditorApi, input: SaveInput): Promise<SaveResult> {
  const { draft: d, event, structureId } = input;
  if (input.validate) {
    const invalid = firstEventProblem(d);
    if (invalid) return { ok: false, step: invalid.step, error: invalid.problem, createdId: input.createdId };
  }

  const targetId = event?.id ?? input.createdId;
  const wasMultiDay = (event?.days.length ?? 0) > 1;
  try {
    // Retour à un seul jour d'un événement qui en avait plusieurs : les jours d'abord (les dates suivent).
    if (event && wasMultiDay && !d.multiDay) await client.putEventDays(event.id, eventDaysPayload(d));
  } catch (error) {
    return { ok: false, step: "type", error, createdId: input.createdId };
  }

  let saved: EventOrganizer;
  try {
    const body = eventPayload(d, Boolean(targetId) && d.multiDay);
    saved = targetId ? await client.updateEvent(targetId, body) : await client.createEvent(structureId, body);
  } catch (error) {
    return { ok: false, step: targetId ? "type" : "lieu", error, createdId: input.createdId };
  }

  if (d.multiDay) {
    try {
      await client.putEventDays(saved.id, eventDaysPayload(d));
    } catch (error) {
      return { ok: false, step: "type", error, createdId: event ? null : saved.id };
    }
  }

  const warnings: string[] = [];
  const zones = zoneChanges(event?.zones ?? [], d.zones);
  const needs = needChanges(input.savedNeeds ?? [], d);
  const calls = [
    ...zones.remove.map((id) => () => client.deleteZone(saved.id, id)),
    ...zones.update.map((z) => () => client.updateZone(saved.id, z.id, z.zone)),
    ...zones.create.map((zone) => () => client.addZone(saved.id, zone)),
    ...needs.remove.map((id) => () => client.deleteNeed(saved.id, id)),
    ...needs.update.map((n) => () => client.updateNeed(saved.id, n.id, n.need)),
    ...needs.create.map((need) => () => client.addNeed(saved.id, need)),
  ];
  let failed = false;
  for (const call of calls) {
    try {
      await call();
    } catch {
      failed = true;
    }
  }
  if (failed) warnings.push(L.savedPartly(L.zonesFailed));

  if (input.poster) {
    try {
      await client.uploadPoster(saved.id, input.poster);
    } catch {
      warnings.push(L.savedPartly(L.posterFailed));
    }
  }
  const [fresh, freshNeeds] = await Promise.all([
    client.orgEvent(saved.id).catch(() => saved),
    client.eventNeeds(saved.id).catch(() => [...(input.savedNeeds ?? [])]),
  ]);
  return { ok: true, event: fresh, needs: freshNeeds, warnings };
}
