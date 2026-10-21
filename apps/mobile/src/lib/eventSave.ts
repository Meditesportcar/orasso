// Enregistrement de l'assistant d'événement de l'appli (lot 35b ; lot 53 : à chaque temps d'un brouillon), même
// enchaînement que le site (`EventWizard.persist`) : l'événement (POST ou PATCH ; l'affiche générée est rendue par l'API
// avec ses réglages), ses jours (lot 26), ses zones, ses missions (lot 46), l'affiche perso ; puis l'événement et ses
// missions sont relus, pour que l'assistant réconcilie sa saisie avec ce que le serveur garde (`reconcileDraft`).
// Ce que l'API refuse (une zone, une mission, une suppression, l'affiche perso) est rendu dans `refused` : la saisie
// le garde, rien n'est marqué enregistré qui ne l'est pas (relecture du lot 53). Une panne (réseau, double
// authentification, 423) laisse l'assistant sur son temps (`step: null`) ; seul un temps invalide ou des jours refusés
// y renvoient. Correctif du lot 26 conservé : un événement créé dont l'enregistrement des jours a échoué passe en
// modification (pas de second POST), et un événement existant sur plusieurs jours part sans dates dans le PATCH.
import {
  type EventDraft,
  type EventNeedView,
  type EventOrganizer,
  type EventWizardStep,
  eventDaysPayload,
  eventPayload,
  eventPublishProblem,
  firstEventProblem,
  type NeedWrites,
  needChanges,
  noNeedWrites,
  noRefusals,
  type SaveRefusals,
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
  /** Vérifie tous les temps avant d'envoyer : `true` (fin de l'assistant) ou `"publish"` (Publier : l'affiche aussi). */
  validate?: boolean | "publish";
};

export type SaveResult =
  | { ok: true; event: EventOrganizer; needs: EventNeedView[]; refused: SaveRefusals }
  /**
   * `step` : le temps à rouvrir (temps invalide, jours refusés), `null` pour rester sur le temps courant ; `error` :
   * l'erreur de l'API (message, double authentification) ou un texte ; `createdId` : événement créé par cet appel ;
   * `needWrites` : missions créées ou supprimées avant la panne (correctif 53c), à reporter avant de retenter
   * (`afterNeedWrites`) pour ne pas les recréer.
   */
  | { ok: false; step: EventWizardStep | null; error: unknown; createdId: string | null; needWrites?: NeedWrites };

/**
 * Une réponse de l'API qui refuse (pas une panne réseau, `status` 0 de `ApiRequestError`) : on peut renvoyer au temps
 * concerné. Lu sans importer `http.ts` (qui charge React Native) : ce fichier reste testable seul.
 */
const refusedByApi = (error: unknown) => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status > 0;
};

export async function saveEvent(client: EventEditorApi, input: SaveInput): Promise<SaveResult> {
  const { draft: d, event, structureId } = input;
  if (input.validate) {
    const invalid = input.validate === "publish" ? eventPublishProblem(d) : firstEventProblem(d);
    if (invalid) return { ok: false, step: invalid.step, error: invalid.problem, createdId: input.createdId };
  }

  const targetId = event?.id ?? input.createdId;
  const wasMultiDay = (event?.days.length ?? 0) > 1;
  try {
    // Retour à un seul jour d'un événement qui en avait plusieurs : les jours d'abord (les dates suivent).
    if (event && wasMultiDay && !d.multiDay) await client.putEventDays(event.id, eventDaysPayload(d));
  } catch (error) {
    return { ok: false, step: refusedByApi(error) ? "type" : null, error, createdId: input.createdId };
  }

  let saved: EventOrganizer;
  try {
    const body = eventPayload(d, Boolean(targetId) && d.multiDay);
    saved = targetId ? await client.updateEvent(targetId, body) : await client.createEvent(structureId, body);
  } catch (error) {
    return { ok: false, step: null, error, createdId: input.createdId };
  }
  const createdId = event ? null : saved.id;

  if (d.multiDay) {
    try {
      await client.putEventDays(saved.id, eventDaysPayload(d));
    } catch (error) {
      return { ok: false, step: refusedByApi(error) ? "type" : null, error, createdId };
    }
  }

  const refused = noRefusals();
  const writes = noNeedWrites();
  const zones = zoneChanges(event?.zones ?? [], d.zones);
  const needs = needChanges(input.savedNeeds ?? [], d);
  const removal = () => {
    refused.removals += 1;
  };
  const calls: { call: () => Promise<unknown>; refuse: () => void }[] = [
    ...zones.remove.map((id) => ({ call: () => client.deleteZone(saved.id, id), refuse: removal })),
    ...zones.update.map((z) => ({
      call: () => client.updateZone(saved.id, z.id, z.zone),
      refuse: () => void refused.zones.push(z.zone.position),
    })),
    // 409 : une zone de ce code existe déjà (créée par un essai précédent dont la relecture a échoué) : c'est fait ; la
    // relecture la rattache à la saisie par son code (correctif 53c).
    ...zones.create.map((zone) => ({
      call: async () => {
        try {
          await client.addZone(saved.id, zone);
        } catch (error) {
          if ((error as { status?: unknown } | null)?.status !== 409) throw error;
        }
      },
      refuse: () => void refused.zones.push(zone.position),
    })),
    ...needs.remove.map((id) => ({
      call: async () => {
        await client.deleteNeed(saved.id, id);
        writes.removed.push(id);
      },
      refuse: removal,
    })),
    ...needs.update.map((n) => ({
      call: () => client.updateNeed(saved.id, n.id, n.need),
      refuse: () => void refused.needs.push(n.need.position),
    })),
    // Chaque création réussie est gardée avec son identifiant : si la suite échoue, le nouvel essai ne la refait pas.
    ...needs.create.map((need) => ({
      call: async () => {
        const created = await client.addNeed(saved.id, need);
        writes.created.push({ position: need.position, need: created });
      },
      refuse: () => void refused.needs.push(need.position),
    })),
  ];
  for (const { call, refuse } of calls) {
    try {
      await call();
    } catch {
      refuse();
    }
  }

  if (input.poster) {
    try {
      await client.uploadPoster(saved.id, input.poster);
    } catch {
      refused.poster = true;
    }
  }
  try {
    const [fresh, freshNeeds] = await Promise.all([client.orgEvent(saved.id), client.eventNeeds(saved.id)]);
    return { ok: true, event: fresh, needs: freshNeeds, refused };
  } catch (error) {
    // Relecture impossible : rien n'est marqué enregistré, la saisie reste à renvoyer (sauf les missions déjà écrites).
    return { ok: false, step: null, error, createdId, needWrites: writes };
  }
}
