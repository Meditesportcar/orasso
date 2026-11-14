// « Enregistrer » une photo d'album : l'enchaînement télécharger, puis ouvrir le partage du système, **sans module natif** (testé). Le partage
// ne s'ouvre que si l'écran est encore ouvert ET que le compte n'a pas changé après l'attente du téléchargement ; sinon le fichier du cache est
// libéré tout de suite et rien ne s'ouvre (`null`).
import { exportWhileOpen } from "../../lib/shareFile";

export type SaveOutcome = "shared" | "saved" | "unavailable";

export async function saveFlow<F>(deps: {
  /** L'écran est toujours ouvert. */
  isOpen: () => boolean;
  /** Le compte du départ est toujours le compte connecté (`accountGuard().current`). */
  sameAccount: () => boolean;
  download: () => Promise<F>;
  release: (file: F) => void;
  isAvailable: () => Promise<boolean>;
  share: (file: F) => Promise<void>;
}): Promise<SaveOutcome | null> {
  const open = () => deps.isOpen() && deps.sameAccount();
  return exportWhileOpen<F, SaveOutcome>(
    open,
    deps.download,
    () => undefined,
    deps.release,
    async (file) => {
      const available = await deps.isAvailable();
      // Fermée ou changée de compte pendant l'attente : rien ne s'ouvre.
      if (!open()) return null;
      if (!available) return "unavailable";
      await deps.share(file);
      return "shared";
    },
  );
}
