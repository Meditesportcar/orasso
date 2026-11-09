// « Sponsorisé » dans le Fil (lot R7k1, ARCHITECTURE-R7 § 2.13, D38). Ces cartes ne passent pas par le classement : elles
// s'insèrent aux positions 4, 10, 16… du Fil entier (`insertSponsored`, packages/shared), jamais dans les trois premières.
// Publicité **non personnalisée** : le département est le seul ciblage (aucune autre donnée de profil, ni intérêts ni
// abonnements). Le choix est déterministe (personne, jour, position) : recharger une page rend les mêmes cartes, et un
// parcours n'en change pas en route. Rien n'est compté ici : l'affichage se compte quand la carte apparaît à l'écran
// (`POST /sponsored/:id/impression` avec `{ surface: "feed" }`).
import { type FeedCard, feedReasonLabel, pickWeighted } from "@orasso/shared";

import { now } from "../../../lib/deps";
import type { Viewer } from "../../../lib/session";
import { sponsoredService } from "../../home/sponsored";
import { parisDay } from "../../pros/service";

export type SponsoredPicker = (position: number) => FeedCard | null;

/**
 * Le tirage des cartes Sponsorisé d'une page du Fil, ou `null` s'il n'y a rien à montrer (réglage coupé, aucun
 * emplacement ouvert à cette personne). Une même carte n'apparaît pas deux fois dans une page.
 */
export async function sponsoredPicker(v: Viewer): Promise<SponsoredPicker | null> {
  const candidates = await sponsoredService.feedCandidates(v);
  if (!candidates.length) return null;
  const day = parisDay(now());
  const at = now().toISOString();
  const used = new Set<string>();
  return (position) => {
    const picked = pickWeighted(
      candidates.filter((c) => !used.has(c.id)),
      `${v.user.id}|${day}|feed|${position}`,
    );
    if (!picked) return null;
    used.add(picked.id);
    return {
      // Un identifiant par apparition (clé de liste côté écran) ; l'emplacement est dans `payload.id`.
      id: `sponsored:${picked.id}:${position}`,
      kind: "sponsored",
      reason: { code: "sponsored", label: feedReasonLabel("sponsored") },
      at,
      payload: picked.payload,
    };
  };
}
