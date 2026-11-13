// Envoi d'un album, une photo à la fois (lot R9e, T31 ; reprend `galleryUploads.ts`) : chaque photo est envoyée
// (`POST /me/uploads purpose=album_photo`, cadres de plaque floutés à l'envoi si le média l'a décidé) puis **ajoutée** à l'album
// (`POST /me/albums/:id/photos`), qui consomme son envoi tout de suite. Rien de React Native ici : la logique se teste seule.
//
// - **La décision de plaque est par photo** (tour 1) : une photo sans plaque repérée part « aucune plaque » (`none`) ; une photo à plaque
//   repérée part avec **sa** décision (« Flouter et ajouter » | « Envoyer telle quelle »). Le bloc du lot pose la décision de toutes les
//   photos qui n'en ont pas encore ; une photo à plaque ajoutée après coup **rouvre le bloc** pour elle seule. « Changer » ne rouvre que
//   les photos dont l'ajout n'a pas été demandé : dès qu'un ajout est parti (même sans réponse), la décision est figée, côté écran comme côté
//   API (409 si un rejeu porte une autre décision).
// - Reprise après coupure : chaque photo a son `clientId` (l'API rejoue le même ajout sans doublon) et garde son envoi réussi (cache par
//   signature : photo + décision + cadres). Une photo dont la décision ou les cadres ont changé avant l'ajout voit son envoi retiré
//   (`retire`, puis `release` libère la place avant le remplacement) et repart.
// - Un échec arrête la série à cette photo ; les photos faites restent faites, « Reprendre l'envoi » repart de la première restante.
import { albumLabels } from "../labels/albums.fr";
import type { AlbumPhotoView, AlbumPlateDecision } from "../schemas/albums";
import { ALBUM_MAX_PHOTOS } from "../schemas/media";
import type { PlateRect } from "../schemas/vehicle";
import { cancelOp, type RemovalQueue } from "./removalQueue";

/** Photos au plus par ouverture du sélecteur du système (limite du système, fiche R9e). */
export const PICK_PER_OPEN = 30;

/** Combien de photos on peut encore demander au sélecteur : 30 au plus par ouverture, jamais au-delà du plafond de l'album. */
export const pickLimit = (alreadyInAlbum: number, pending: number): number =>
  Math.max(0, Math.min(PICK_PER_OPEN, ALBUM_MAX_PHOTOS - alreadyInAlbum - pending));

/** Ce que dit le sélecteur quand le plafond coupe la sélection (`null` : rien à dire) ; l'album plein ne dit pas « 0 photos gardées ». */
export function pickNotice(room: number, asked: number): string | null {
  if (asked <= room) return null;
  return room === 0 ? albumLabels.pickFull(ALBUM_MAX_PHOTOS) : albumLabels.pickCut(room, asked);
}

/** Le choix pour une photo à plaque repérée. */
export type BatchChoice = "blurred" | "kept";

export type AlbumItem = {
  /** Identifiant de la tentative (UUID) : rend l'ajout rejouable. */
  clientId: string;
  uri: string;
  width: number;
  height: number;
  /** Cadres repérés par l'appareil ou posés à la main (vide : aucune plaque). */
  rects: PlateRect[];
  /** La détection est faite (la photo sait si elle porte une plaque). */
  detected: boolean;
  /** Les cadres ont été réglés ou posés à la main : un résultat de détection qui arrive après ne les remplace jamais. */
  edited?: boolean;
  /** La décision prise pour **cette** photo (seulement si elle porte un cadre). */
  decision?: BatchChoice;
  /** L'ajout a été demandé à l'API (la réponse a pu se perdre) : décision et cadres ne changent plus. */
  attempted?: boolean;
  /** Envoi réussi, pas encore ajouté (gardé pour la reprise). */
  upload?: { id: string; key: string; signature: string };
  /** Ajoutée à l'album. */
  photoId?: string;
  /** Adresse de la version du serveur (floutée si « Flouter ») : ce que le média voit après l'envoi, jamais l'original local. */
  serverUrl?: string;
};

/** L'ajout est parti ou a réussi : la décision et les cadres sont figés. */
export const isPhotoLocked = (item: Pick<AlbumItem, "attempted" | "photoId">): boolean =>
  Boolean(item.attempted || item.photoId);

/** Ce qui part pour cette photo : « aucune plaque » sans cadre, sinon **sa** décision (`null` : il manque la décision). */
export function decisionOf(item: Pick<AlbumItem, "rects" | "decision">): AlbumPlateDecision | null {
  if (item.rects.length === 0) return "none";
  return item.decision ?? null;
}

/** Photo + décision + cadres : l'identité d'un envoi réutilisable. */
export function signatureOf(item: Pick<AlbumItem, "uri" | "rects">, decision: AlbumPlateDecision): string {
  return `${item.uri}|${decision}|${decision === "none" ? "" : JSON.stringify(item.rects)}`;
}

/** Une photo à plaque dont on attend encore la décision (le bloc « N photos avec une plaque repérée »). */
const needsDecision = (i: AlbumItem): boolean => !isPhotoLocked(i) && i.detected && i.rects.length > 0 && !i.decision;

/** Photos à plaque qui attendent leur décision. */
export const platedCount = (items: readonly AlbumItem[]): number => items.filter(needsDecision).length;

/** Photos encore à envoyer. */
export const remaining = (items: readonly AlbumItem[]): AlbumItem[] => items.filter((i) => !i.photoId);

/** Pose le choix sur chaque photo à plaque qui n'a pas encore de décision (les autres gardent la leur). */
export function decideAll<T extends AlbumItem>(items: readonly T[], choice: BatchChoice): T[] {
  return items.map((i) => (needsDecision(i) ? { ...i, decision: choice } : i));
}

/** « Changer » : seules les décisions des photos dont l'ajout n'est pas parti peuvent être reprises. */
export const canReopen = (items: readonly AlbumItem[]): boolean =>
  items.some((i) => !isPhotoLocked(i) && i.rects.length > 0 && i.decision !== undefined);

/** « Changer » : rouvre la décision des photos non figées ; les photos figées gardent la leur. */
export function reopenDecisions<T extends AlbumItem>(items: readonly T[]): T[] {
  return items.map((i) => {
    if (isPhotoLocked(i) || i.decision === undefined) return i;
    const { decision: _gone, ...rest } = i;
    return rest as T;
  });
}

/** Combien de photos portent chaque décision (une photo sans cadre n'en a pas). */
export function decidedCounts(items: readonly AlbumItem[]): { blurred: number; kept: number } {
  let blurred = 0;
  let kept = 0;
  for (const i of items) {
    if (i.rects.length === 0) continue;
    if (i.decision === "blurred") blurred++;
    else if (i.decision === "kept") kept++;
  }
  return { blurred, kept };
}

/** Photos dont la plaque est floutée parmi celles de la séance (celles d'un brouillon repris se comptent à part : `blurredCount`). */
export const blurredOf = (items: readonly AlbumItem[]): number => decidedCounts(items).blurred;

/**
 * Le résultat de la détection d'une photo : jamais un cadre posé à la main (ni remplacé, ni effacé par un résultat vide) ; sinon les cadres
 * trouvés.
 */
export function detectionPatch(item: Pick<AlbumItem, "rects" | "edited">, found: PlateRect[]): Partial<AlbumItem> {
  if (item.edited || item.rects.length > 0) return { detected: true };
  return { detected: true, rects: found };
}

/** Rapprochement : une photo dont l'ajout a réussi sans réponse est retrouvée dans l'album par son `clientId`. */
export function reconcile<T extends AlbumItem>(
  items: readonly T[],
  photos: readonly Pick<AlbumPhotoView, "id" | "url" | "clientId">[],
): T[] {
  const byClient = new Map(photos.filter((p) => p.clientId).map((p) => [p.clientId as string, p]));
  return items.map((i) => {
    const found = i.photoId ? undefined : byClient.get(i.clientId);
    return found ? { ...i, photoId: found.id, serverUrl: found.url, upload: undefined, attempted: true } : i;
  });
}

export type SendDeps = {
  /** Envoie le fichier ; les cadres ne partent que pour « floutée ». */
  upload: (item: AlbumItem, rects: PlateRect[] | null) => Promise<{ id: string; key: string }>;
  /** Ajoute la photo envoyée à l'album (`clientId` = celui de la photo) ; rend la photo du serveur (sa version servie). */
  add: (
    item: AlbumItem,
    body: { uploadKey: string; plateDecision: AlbumPlateDecision; plateRects?: PlateRect[]; clientId: string },
  ) => Promise<{ id: string; url?: string }>;
  /** Un envoi dont la décision ou les cadres ont changé : à supprimer côté API (`DELETE /me/uploads/:id`). */
  retire: (upload: { id: string; key: string }) => void;
  /** Libère la place des envois retirés **avant** d'en envoyer d'autres (le quota d'envois en attente est borné). */
  release?: () => Promise<void>;
  onProgress?: (current: number, total: number) => void;
  /** Mise à jour d'une photo (envoi réussi, ajout demandé, photo ajoutée) : l'écran garde l'état pour la reprise. */
  onItem: (clientId: string, patch: Partial<AlbumItem>) => void;
  stopped?: () => boolean;
};

/** Envoi arrêté par la fermeture de l'écran. */
export class AlbumSendStopped extends Error {
  constructor() {
    super("Envoi interrompu");
  }
}

/**
 * Envoie et ajoute, dans l'ordre, les photos qui restent. S'arrête à la première erreur (réseau, refus de l'API) : elle remonte,
 * les photos déjà faites sont signalées par `onItem`. Rend le nombre de photos ajoutées pendant cet appel. La progression compte toutes les
 * photos de la séance (« 38 / 48 » à la reprise), pas seulement celles qui restent.
 */
export async function sendAlbumPhotos(items: readonly AlbumItem[], deps: SendDeps): Promise<number> {
  const todo = remaining(items);
  const already = items.length - todo.length;
  let done = 0;
  for (const [i, item] of todo.entries()) {
    if (deps.stopped?.()) throw new AlbumSendStopped();
    const decision = decisionOf(item);
    if (!decision) throw new Error("Décide du floutage avant d'envoyer.");
    deps.onProgress?.(already + i + 1, items.length);
    const signature = signatureOf(item, decision);
    let upload = item.upload;
    // La décision ou les cadres ont changé depuis l'envoi (l'ajout n'est pas parti : sinon rien ne peut changer) : l'ancien envoi ne convient plus.
    if (upload && upload.signature !== signature) {
      deps.retire({ id: upload.id, key: upload.key });
      deps.onItem(item.clientId, { upload: undefined });
      upload = undefined;
    }
    if (!upload) {
      // Tout nouvel envoi attend derrière le nettoyage requis (retraits, annulations non confirmées) : la place du quota est libérée d'abord.
      await deps.release?.();
      const sent = await deps.upload(item, decision === "blurred" ? item.rects : null);
      upload = { ...sent, signature };
      deps.onItem(item.clientId, { upload });
    }
    // L'ajout part : la décision est figée (la réponse peut se perdre, le serveur l'aura peut-être gardée).
    deps.onItem(item.clientId, { attempted: true, ...(decision === "none" ? {} : { decision }) });
    const added = await deps.add(item, {
      uploadKey: upload.key,
      plateDecision: decision,
      ...(decision === "none" ? {} : { plateRects: item.rects }),
      clientId: item.clientId,
    });
    // Consommé par l'album : plus d'envoi à garder ; la vignette devient la version du serveur.
    deps.onItem(item.clientId, {
      photoId: added.id,
      upload: undefined,
      ...(added.url ? { serverUrl: added.url } : {}),
    });
    done++;
  }
  return done;
}

export type RemoveItemDeps = {
  albumId: string;
  /** La file : l'annulation y entre **avant** son premier appel réseau (mémoire et stockage) et n'en sort que sur la réponse de l'API. */
  queue: Pick<RemovalQueue, "retire" | "release" | "enqueue" | "takeDropped">;
};

export type RemoveItemResult =
  /** Confirmée par l'API (204) : la photo n'est pas dans l'album et n'y entrera pas. */
  | { status: "removed" }
  /** Pas encore confirmée (hors ligne, session expirée, 5xx…) : l'annulation reste en file, la photo part de l'écran, la publication attend. */
  | { status: "queued" }
  /** Refus définitif (400, 404, 409, 422) : la photo **reste** (jamais retirée à l'écran), avec l'erreur de l'API. */
  | { status: "refused"; error: unknown };

/**
 * Retire une photo de la séance. Une photo dont l'ajout est parti (même sans réponse) est **annulée par son `clientId`**, côté API et
 * sous le verrou de l'ajout : un ajout encore en route finira refusé, un ajout fini sera retiré. L'annulation **entre dans la file avant
 * son premier appel réseau** : pendant l'attente, `hasPending()` est vrai et la publication ne peut pas passer devant elle. La réussite
 * n'est déclarée que sur la réponse de l'API, jamais sur un 404 seul. L'envoi de la photo, s'il en reste un, est supprimé après (la file
 * passe les annulations avant les envois).
 */
export async function removeAlbumItem(item: AlbumItem, deps: RemoveItemDeps): Promise<RemoveItemResult> {
  let result: RemoveItemResult = { status: "removed" };
  if (item.attempted || item.photoId) {
    const op = cancelOp(deps.albumId, item.clientId);
    const outcome = await deps.queue.enqueue(op);
    if (outcome === "refused") return { status: "refused", error: deps.queue.takeDropped(op.id)[0]?.error };
    if (outcome === "pending") result = { status: "queued" };
  }
  if (item.upload) deps.queue.retire({ id: item.upload.id, key: item.upload.key });
  void deps.queue.release();
  return result;
}

/**
 * Photos de l'album que l'écran ne montre plus : un retrait refusé pour de bon (après coup, au rejeu) les a laissées côté serveur. Elles
 * **réapparaissent** dans la grille (version du serveur) avant toute publication ; les photos déjà montrées ne sont pas doublées.
 */
export function reappearedPhotos(
  albumPhotos: readonly AlbumPhotoView[],
  shown: { photoIds: readonly string[]; clientIds: readonly string[] },
): AlbumPhotoView[] {
  const ids = new Set(shown.photoIds);
  const clients = new Set(shown.clientIds);
  return albumPhotos.filter((p) => !ids.has(p.id) && !(p.clientId && clients.has(p.clientId)));
}
