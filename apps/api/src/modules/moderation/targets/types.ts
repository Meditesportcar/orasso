// Registre des cibles de signalement (lot 32, § 15.2) : une sorte de contenu = un fichier `targets/<type>.ts`.
import type { ReportContextMessage, ReportTarget, ReportTargetView } from "@orasso/shared";

import type { reports } from "../../../db/schema";
import type { Viewer } from "../../../lib/session";
import type { Tx } from "../../../lib/tx";

export type ReportRow = typeof reports.$inferSelect;

/** Résolution à la création d'un signalement. */
export type ResolvedTarget = {
  /** Propriétaire du contenu (compte sanctionnable) ; `null` si personne (structure sans propriétaire…). */
  ownerId: string | null;
  /** Message : copie du message et de ses voisins (AS5). */
  context?: ReportContextMessage[];
};

export type TargetView = Omit<ReportTargetView, "type" | "id">;

export type TargetRules = {
  type: ReportTarget;
  /**
   * Le contenu existe et le signaleur peut le voir (mêmes règles d'audience que sa lecture) → son propriétaire.
   * `404` sinon (on ne révèle pas l'existence d'un contenu invisible).
   */
  resolve(v: Viewer, targetId: string): Promise<ResolvedTarget>;
  /** Ce que voit l'administration (jamais la plaque, ni la conversation en direct). */
  view(report: ReportRow): Promise<TargetView>;
  /**
   * Retrait du contenu par le super administrateur (dans la transaction de la décision) ; rend les fichiers à effacer
   * après la validation et les effets à jouer ensuite. Absent : retrait impossible (profil, véhicule : on sanctionne
   * le propriétaire).
   */
  remove?: (tx: Tx, v: Viewer, report: ReportRow, after: (cb: () => unknown) => void) => Promise<string[]>;
  /** Retrait qui passe par un service complet hors transaction (annulation d'un événement). */
  removeOutside?: (v: Viewer, report: ReportRow) => Promise<void>;
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const goneView = (title: string): TargetView => ({
  title,
  text: null,
  imageUrl: null,
  link: null,
  gone: true,
  removed: false,
});
