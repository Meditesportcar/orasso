import type { DevicePlatform, ProfileVisibility } from "../enums";

// Compte : visibilité du profil, appareils.

export const profileVisibilityLabels: Record<ProfileVisibility, string> = {
  public: "Public",
  private: "Privé",
};

export const devicePlatformLabels: Record<DevicePlatform, string> = {
  ios: "iPhone",
  android: "Android",
  web: "Navigateur",
};

/** Règles d'affichage d'un compte public ou privé (docs/01 « Compte public ou privé », corrigé le 15/10). */
export const profileVisibilityRules: Record<ProfileVisibility, string> = {
  public:
    "Les autres utilisateurs connectés voient ton profil complet : garage, photos, événements, crews. Ton compte reste trouvable et peut recevoir des demandes d'ami ou de contact.",
  private:
    "Les autres utilisateurs voient seulement ton pseudo, ta photo de profil, ton grade, et la marque et le modèle de tes véhicules ; tes amis voient tout. Ton compte reste trouvable et peut recevoir des demandes d'ami ou de contact.",
};

/** Ce qui vaut dans les deux cas (docs/01). */
export const profileVisibilityAlways =
  "Dans tous les cas : l'organisateur voit tout de ses inscrits et de ses abonnés, les profils sont réservés aux utilisateurs connectés, et ta plaque n'est jamais publique.";

/** Compte protégé par une clé d'accès seulement, connecté dans l'appli par mot de passe (lot 16) : l'action se fait sur le site. */
export const passkeyOnlyMessage =
  "Ton compte est protégé par une clé d'accès : fais cette action sur le site, connecté avec ta clé.";
export const passkeyOnlyButton = "Ouvrir la sécurité sur le site";
