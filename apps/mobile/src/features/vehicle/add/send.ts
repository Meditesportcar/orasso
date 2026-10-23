// Envoi de l'ajout ou de la modification d'un véhicule (lot M1, tour 2), sans React ni réseau réel : l'écran
// (`VehicleWizard.tsx`) lui passe le brouillon, la mémoire de l'envoi et les appels à l'API ; testé avec une API simulée
// (`send.test.ts`).
//
// Règles :
// - Rien ne part si le brouillon n'est pas complet (`firstIssue`) : une photo ajoutée ou recadrée après l'étape Plaque,
//   sans cadre ni « aucune plaque » confirmé, ramène à cette étape (vie privée de la plaque). L'API refuse aussi une
//   photo sans décision (défense en profondeur).
// - Les opérations sont versionnées par contenu et par cadres : une photo déjà envoyée puis recadrée (ou dont les
//   cadres ont changé) est remplacée en ligne, avec ses nouveaux masques ; une photo retirée du brouillon après un envoi
//   partiel est retirée en ligne.
// - La création porte une clé client (`clientKey`) : « Reprendre » après une réponse perdue ne crée pas de doublon.
import type { PlateRect, VehicleCreate, VehicleFull, VehicleUpdate } from "@orasso/shared";

import { createBody, type Draft, type DraftPhoto, firstIssue, needsPlateDecision, STEP, updateBody } from "./model";

/** Ce qui part pour une photo locale : le carré envoyé et la décision de plaque. Change au recadrage. */
export const photoSignature = (p: Pick<DraftPhoto, "uri" | "rects" | "noPlate">): string =>
  JSON.stringify([p.uri, p.rects, Boolean(p.noPlate)]);

const rectsSignature = (rects: readonly PlateRect[]): string => JSON.stringify(rects);

/** Mémoire d'un envoi, gardée entre deux tentatives (« Reprendre », retour à une étape puis nouvel envoi). */
export type SendMemo = {
  /** Clé client de la création (idempotence de `POST /me/vehicles`). */
  clientKey: string;
  vehicleId: string | null;
  /** Fiche telle que l'API la connaît (créée ou modifiée) : la reprise n'envoie que ce qui a changé depuis. */
  base: VehicleFull | null;
  /** Plaque d'un autre membre : véhicule en attente de transfert. */
  pending: boolean;
  /** Photo locale envoyée → photo en ligne et signature de ce qui est parti. */
  uploaded: Map<string, { id: string; sig: string }>;
  /** Photo déjà en ligne floutée pendant cet envoi → signature des cadres appliqués. */
  blurred: Map<string, string>;
  /** Envoi de photo dont la réponse n'est pas arrivée : à retrouver avant de la renvoyer (pas de doublon). */
  inFlight: { key: string; sig: string; before: string[] } | null;
};

export function newSendMemo(clientKey: string, vehicle?: VehicleFull): SendMemo {
  return {
    clientKey,
    vehicleId: vehicle?.id ?? null,
    base: vehicle ?? null,
    pending: false,
    uploaded: new Map(),
    blurred: new Map(),
    inFlight: null,
  };
}

export type PhotoOp =
  | { kind: "remove"; photoId: string }
  | { kind: "upload"; key: string; sig: string; rects: PlateRect[]; noPlate: boolean }
  | { kind: "blur"; key: string; photoId: string; rects: PlateRect[]; sig: string };

/**
 * Opérations sur les photos, dans l'ordre : retraits (photos d'avant retirées, envois périmés), envois (photos locales
 * jamais envoyées ou changées depuis, avec leurs cadres), floutages des photos déjà en ligne. `online` : les photos que
 * le serveur a encore (on ne retire que celles-là). L'ordre final est posé ensuite par `PUT …/photos/order`.
 */
export function photoPlan(
  d: Draft,
  before: readonly { id: string }[],
  memo: Pick<SendMemo, "uploaded" | "blurred">,
  online?: ReadonlySet<string>,
): PhotoOp[] {
  const local = d.photos.filter((p) => !p.remoteId);
  const fresh = (p: DraftPhoto) => memo.uploaded.get(p.key)?.sig === photoSignature(p);
  const keep = new Set<string>();
  for (const p of d.photos) if (p.remoteId) keep.add(p.remoteId);
  for (const p of local) {
    const sent = memo.uploaded.get(p.key);
    if (sent && fresh(p)) keep.add(sent.id);
  }
  const candidates = [...before.map((p) => p.id), ...[...memo.uploaded.values()].map((u) => u.id)];
  const ops: PhotoOp[] = [];
  for (const id of new Set(candidates)) {
    if (!keep.has(id) && (!online || online.has(id))) ops.push({ kind: "remove", photoId: id });
  }
  for (const p of local) {
    if (!fresh(p)) {
      ops.push({ kind: "upload", key: p.key, sig: photoSignature(p), rects: p.rects, noPlate: Boolean(p.noPlate) });
    }
  }
  for (const p of d.photos) {
    if (!p.remoteId || !p.rects.length) continue;
    const sig = rectsSignature(p.rects);
    if (memo.blurred.get(p.key) !== sig)
      ops.push({ kind: "blur", key: p.key, photoId: p.remoteId, rects: p.rects, sig });
  }
  return ops;
}

/** Brouillon incomplet au moment de l'envoi : l'écran revient à l'étape `step` et montre le message. */
export class DraftIncomplete extends Error {
  constructor(
    readonly step: number,
    message: string,
  ) {
    super(message);
  }
}

/** Ce que l'envoi demande à l'API (l'écran branche `lib/api` ; les tests, une API simulée). */
export type SendApi = {
  create: (body: VehicleCreate) => Promise<VehicleFull>;
  update: (id: string, body: VehicleUpdate) => Promise<VehicleFull>;
  get: (id: string) => Promise<VehicleFull>;
  /** `fields` : `plateRects` (cadres floutés par l'API) ou `noPlate: true` (« aucune plaque visible » confirmé). */
  upload: (
    id: string,
    photo: DraftPhoto,
    fields: { plateRects: PlateRect[] } | { noPlate: true },
    index: number,
  ) => Promise<VehicleFull>;
  blur: (id: string, photoId: string, rects: PlateRect[]) => Promise<VehicleFull>;
  remove: (id: string, photoId: string) => Promise<VehicleFull>;
  reorder: (id: string, photoIds: string[]) => Promise<VehicleFull>;
};

export type SendHooks = {
  /** `done` opérations faites sur `total` (photos). */
  progress?: (done: number, total: number) => void;
  photo?: (key: string, state: "sending" | "done") => void;
};

/**
 * Envoie le brouillon : création (ou modification), photos une à une avec leur décision de plaque, ordre final.
 * Reprend là où une tentative précédente s'est arrêtée (`memo`). Lève `DraftIncomplete` sans rien envoyer si une étape
 * n'est pas complète, et les erreurs de l'API telles quelles.
 */
export async function runSend(
  draft: Draft,
  before: readonly { id: string }[],
  memo: SendMemo,
  api: SendApi,
  hooks: SendHooks = {},
): Promise<VehicleFull> {
  // Tout le brouillon est revérifié avant chaque envoi (photo ajoutée après l'étape Plaque, détection en cours…).
  const issue = firstIssue(draft);
  if (issue) throw new DraftIncomplete(issue.step, issue.issue);

  let current: VehicleFull | null = null;
  if (!memo.vehicleId) {
    current = await api.create({ ...createBody(draft), clientKey: memo.clientKey });
    memo.vehicleId = current.id;
    memo.base = current;
    memo.pending = Boolean(current.plateTransfer);
  } else if (memo.base) {
    // Modification, ou reprise après une erreur corrigée : seulement ce qui a changé depuis la dernière fiche.
    const body = updateBody(draft, memo.base);
    if (Object.keys(body).length) {
      current = await api.update(memo.vehicleId, body);
      memo.base = current;
      memo.pending = Boolean(current.plateTransfer);
    }
  }
  const id = memo.vehicleId as string;
  current ??= await api.get(id);

  // Réponse perdue pendant un envoi de photo : si la photo est arrivée, on la garde au lieu de la renvoyer (elle sera
  // remplacée plus bas si elle a été recadrée depuis).
  if (memo.inFlight) {
    const seen = new Set(memo.inFlight.before);
    const known = new Set([...memo.uploaded.values()].map((u) => u.id));
    const arrived = current.photos.find((p) => !seen.has(p.id) && !known.has(p.id));
    if (arrived) memo.uploaded.set(memo.inFlight.key, { id: arrived.id, sig: memo.inFlight.sig });
    memo.inFlight = null;
  }

  const ops = photoPlan(draft, before, memo, new Set(current.photos.map((p) => p.id)));
  hooks.progress?.(0, ops.length);
  let n = 0;
  for (const op of ops) {
    if (op.kind === "remove") {
      current = await api.remove(id, op.photoId);
      for (const [key, u] of memo.uploaded) if (u.id === op.photoId) memo.uploaded.delete(key);
    } else if (op.kind === "upload") {
      const photo = draft.photos.find((p) => p.key === op.key);
      if (photo) {
        // Dernier filet avant le réseau : jamais une photo sans cadre ni « aucune plaque » confirmé.
        if (needsPlateDecision(photo) || photo.detection === "pending") {
          throw new DraftIncomplete(STEP.plate, firstIssue(draft)?.issue ?? "");
        }
        hooks.photo?.(op.key, "sending");
        const fields = op.rects.length ? { plateRects: op.rects } : { noPlate: true as const };
        const seen = current.photos.map((p) => p.id);
        memo.inFlight = { key: op.key, sig: op.sig, before: seen };
        const after = await api.upload(id, photo, fields, n);
        memo.inFlight = null;
        const added = after.photos.find((p) => !seen.includes(p.id));
        if (added) memo.uploaded.set(op.key, { id: added.id, sig: op.sig });
        current = after;
        hooks.photo?.(op.key, "done");
      }
    } else {
      current = await api.blur(id, op.photoId, op.rects);
      memo.blurred.set(op.key, op.sig);
    }
    n++;
    hooks.progress?.(n, ops.length);
  }

  // Ordre final : la couverture choisie en tête.
  const order = draft.photos
    .map((p) => p.remoteId ?? memo.uploaded.get(p.key)?.id)
    .filter((x): x is string => Boolean(x));
  const currentOrder = current.photos.map((p) => p.id);
  if (order.length > 1 && order.join() !== currentOrder.join()) current = await api.reorder(id, order);
  return current;
}
