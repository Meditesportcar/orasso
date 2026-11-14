// Le pont entre le bouton de la visionneuse et la feuille des identifications (lot R9f). La visionneuse d'un album (`AlbumPhotoViewer`,
// partagée avec R9g) ne rend que des boutons à libellé fixe : leur `run` reçoit la photo **affichée** ; il l'inscrit ici, et la feuille
// (`TagHost`, posée dans l'emplacement `actions` de la visionneuse) s'ouvre sur cette photo. Un seul état par application : une seule
// visionneuse est ouverte à la fois.
import { useSyncExternalStore } from "react";

type Listener = () => void;
let photoId: string | null = null;
const listeners = new Set<Listener>();

export const tagHost = {
  /** Ouvre la feuille sur cette photo. */
  open(id: string) {
    photoId = id;
    for (const l of listeners) l();
  },
  close() {
    if (photoId === null) return;
    photoId = null;
    for (const l of listeners) l();
  },
  get: () => photoId,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** La photo dont la feuille est ouverte, ou `null`. */
export const useTagHostPhoto = () => useSyncExternalStore(tagHost.subscribe, tagHost.get, tagHost.get);
