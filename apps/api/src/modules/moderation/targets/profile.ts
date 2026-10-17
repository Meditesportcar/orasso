// Cible « profil » : `target_id` = identifiant du compte (stable même si le pseudo change). Pas de retrait de contenu :
// on sanctionne le propriétaire.
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { profilesRepo } from "../../profiles/repo";
import { socialProfile } from "../../social/profile";
import { goneView, type TargetRules } from "./types";

export const profileTarget: TargetRules = {
  type: "profile",
  async resolve(v, targetId) {
    const p = await profilesRepo.byUserId(targetId);
    if (!p || p.deletedAt) throw notFound("Profil introuvable");
    // Mêmes règles que `GET /users/:pseudo` (profils réservés aux connectés).
    await socialProfile.view(v, p.pseudo);
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
