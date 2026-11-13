// Envoi d'un album, une photo à la fois (lot R9e, T31 ; reprend `galleryUploads.ts`) : chaque photo est envoyée
// (`POST /me/uploads purpose=album_photo`, cadres de plaque floutés à l'envoi si le média l'a décidé) puis **ajoutée** à l'album
// (`POST /me/albums/:id/photos`), qui consomme son envoi tout de suite. Rien de React Native ici : la logique se teste seule.
//
// - La décision de plaque est une pour le lot (« Flouter et ajouter » ou « Envoyer telle quelle ») ; une photo sans plaque repérée part
//   « aucune plaque » (`none`). Le lot peut changer d'avis (« Changer ») tant que l'envoi n'est pas parti.
// - Reprise après coupure : chaque photo a son `clientId` (l'API rejoue le même ajout sans doublon) et garde son envoi réussi (cache par
//   signature : photo + décision + cadres). Une photo dont la décision a changé depuis l'envoi voit son envoi retiré (`retire`) et repart.
// - Un échec arrête la série à cette photo ; les photos faites restent faites, « Reprendre l'envoi » repart de la première restante.
import type { AlbumPlateDecision } from "../schemas/albums";
import { ALBUM_MAX_PHOTOS } from "../schemas/media";
import type { PlateRect } from "../schemas/vehicle";

/** Photos au plus par ouverture du sélecteur du système (limite du système, fiche R9e). */
export const PICK_PER_OPEN = 30;

/** Combien de photos on peut encore demander au sélecteur : 30 au plus par ouverture, jamais au-delà du plafond de l'album. */
export const pickLimit = (alreadyInAlbum: number, pending: number): number =>
  Math.max(0, Math.min(PICK_PER_OPEN, ALBUM_MAX_PHOTOS - alreadyInAlbum - pending));

/** Le choix du lot pour les photos dont la plaque est repérée. */
export type BatchChoice = "blurred" | "kept";

export type AlbumItem = {
  /** Identifiant de la tentative (UUID) : rend l'ajout rejouable. */
  clientId: string;
  uri: string;
  width: number;
  height: number;
  /** Cadres repérés par l'appareil (vide : aucune plaque repérée). */
  rects: PlateRect[];
  /** La détection est faite (la photo sait si elle porte une plaque). */
  detected: boolean;
  /** Envoi réussi, pas encore ajouté (gardé pour la reprise). */
  upload?: { id: string; key: string; signature: string };
  /** Ajoutée à l'album. */
  photoId?: string;
};

/** Ce qui part pour cette photo : « aucune plaque » sans cadre, sinon le choix du lot (`null` : il manque la décision). */
export function decisionOf(item: Pick<AlbumItem, "rects">, batch: BatchChoice | null): AlbumPlateDecision | null {
  if (item.rects.length === 0) return "none";
  return batch;
}

/** Photo + décision + cadres : l'identité d'un envoi réutilisable. */
export function signatureOf(item: Pick<AlbumItem, "uri" | "rects">, decision: AlbumPlateDecision): string {
  return `${item.uri}|${decision}|${decision === "none" ? "" : JSON.stringify(item.rects)}`;
}

/** Photos dont la plaque est repérée et qui attendent la décision du lot (le bloc « N photos avec une plaque repérée »). */
export const platedCount = (items: readonly AlbumItem[]): number =>
  items.filter((i) => !i.photoId && i.detected && i.rects.length > 0).length;

/** Photos encore à envoyer. */
export const remaining = (items: readonly AlbumItem[]): AlbumItem[] => items.filter((i) => !i.photoId);

/** Photos dont la plaque a été floutée avant l'envoi : « N plaques floutées » (celles de l'album, déjà ajoutées, comprises). */
export const blurredOf = (items: readonly AlbumItem[], batch: BatchChoice | null): number =>
  batch === "blurred" ? items.filter((i) => i.rects.length > 0).length : 0;

export type SendDeps = {
  /** Envoie le fichier ; les cadres ne partent que pour « floutée ». */
  upload: (item: AlbumItem, rects: PlateRect[] | null) => Promise<{ id: string; key: string }>;
  /** Ajoute la photo envoyée à l'album (`clientId` = celui de la photo). */
  add: (
    item: AlbumItem,
    body: { uploadKey: string; plateDecision: AlbumPlateDecision; plateRects?: PlateRect[]; clientId: string },
  ) => Promise<{ id: string }>;
  /** Un envoi dont la décision a changé : à supprimer côté API (`DELETE /me/uploads/:id`). */
  retire: (upload: { id: string; key: string }) => void;
  onProgress?: (current: number, total: number) => void;
  /** Mise à jour d'une photo (envoi réussi, photo ajoutée) : l'écran garde l'état pour la reprise. */
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
 * les photos déjà faites sont signalées par `onItem`. Rend le nombre de photos ajoutées pendant cet appel.
 */
export async function sendAlbumPhotos(
  items: readonly AlbumItem[],
  batch: BatchChoice | null,
  deps: SendDeps,
): Promise<number> {
  const todo = remaining(items);
  let done = 0;
  for (const [i, item] of todo.entries()) {
    if (deps.stopped?.()) throw new AlbumSendStopped();
    const decision = decisionOf(item, batch);
    if (!decision) throw new Error("Décide du floutage avant d'envoyer.");
    deps.onProgress?.(i + 1, todo.length);
    const signature = signatureOf(item, decision);
    let upload = item.upload;
    // La décision a changé depuis l'envoi : l'ancien envoi (déjà flouté ou non) ne convient plus.
    if (upload && upload.signature !== signature) {
      deps.retire({ id: upload.id, key: upload.key });
      deps.onItem(item.clientId, { upload: undefined });
      upload = undefined;
    }
    if (!upload) {
      const sent = await deps.upload(item, decision === "blurred" ? item.rects : null);
      upload = { ...sent, signature };
      deps.onItem(item.clientId, { upload });
    }
    const added = await deps.add(item, {
      uploadKey: upload.key,
      plateDecision: decision,
      ...(decision === "none" ? {} : { plateRects: item.rects }),
      clientId: item.clientId,
    });
    // Consommé par l'album : plus d'envoi à garder.
    deps.onItem(item.clientId, { photoId: added.id, upload: undefined });
    done++;
  }
  return done;
}
