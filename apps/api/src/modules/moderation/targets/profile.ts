// Cible « profil » : `target_id` = identifiant du compte (stable même si le pseudo change). Pas de retrait de contenu :
// on sanctionne le propriétaire.
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { profilesRepo } from "../../profiles/repo";
import { goneView, type TargetRules } from "./types";

export const profileTarget: TargetRules = {
  type: "profile",
  async resolve(v, targetId) {
    const p = await profilesRepo.byUserId(targetId);
    if (!p || p.deletedAt) throw notFound("Profil introuvable");
    // Mêmes règles que `GET /users/:pseudo` (profils réservés aux connectés : `v` est une session ; un compte banni
    // n'est plus atteignable), sauf la suspension. Lot R5b, tour 2 : le profil d'un compte suspendu répond 404 à tous,
    // mais il reste signalable : pendant une suspension automatique, la modération reçoit encore les signalements, pour
    // la prolonger ou la lever (`moderation.test.ts`, « levée »).
    if (p.bannedAt && p.userId !== v.user.id) throw notFound("Profil introuvable");
    return { ownerId: p.userId };
  },
  async view(report) {
    const p = await profilesRepo.byUserId(report.targetId);
    if (!p || p.deletedAt) return goneView("Compte supprimé");
    return {
      title: p.pseudo,
      text: p.bio,
      imageUrl: storage.url(p.avatarKey),
      link: `/u/${encodeURIComponent(p.pseudo)}`,
      gone: false,
      removed: false,
    };
  },
};
