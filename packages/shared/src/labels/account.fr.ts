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

/**
 * Erreurs de Better Auth (codes renvoyés par `/api/auth/*`) et du garde des facteurs, en français. Un code absent
 * d'ici s'affiche avec `authErrorFallback` (jamais le message anglais brut).
 */
export const authErrorLabels: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cet e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cet e-mail.",
  INVALID_EMAIL: "Cette adresse e-mail n'est pas valide.",
  INVALID_PASSWORD: "Mot de passe incorrect.",
  PASSWORD_TOO_SHORT: "Le mot de passe est trop court (8 caractères au moins).",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
  EMAIL_NOT_VERIFIED: "Vérifie ton adresse e-mail avant de te connecter.",
  INVALID_CODE: "Code incorrect. Réessaie avec le code affiché maintenant.",
  INVALID_BACKUP_CODE: "Code de secours incorrect.",
  INVALID_TWO_FACTOR_COOKIE: "L'étape du code a expiré : reconnecte-toi.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Trop d'essais : reconnecte-toi.",
  ACCOUNT_TEMPORARILY_LOCKED: "Trop d'essais : réessaie dans un quart d'heure.",
  TOO_MANY_REQUESTS: "Trop d'essais : réessaie dans un instant.",
  MISSING_OR_NULL_ORIGIN: "Connexion refusée par le serveur (origine de l'appli). Mets l'appli à jour.",
  INVALID_ORIGIN: "Connexion refusée par le serveur (origine de l'appli). Mets l'appli à jour.",
  TWO_FACTOR_REQUIRED: "Reconnecte-toi avec ton code de double authentification ou ta clé d'accès.",
  SESSION_NOT_FRESH: "Reconnecte-toi d'abord.",
  USER_VERIFICATION_REQUIRED: "Ta clé doit demander ton code ou ton empreinte.",
  ROUTE_NOT_AVAILABLE: "Action indisponible.",
  SESSION_EXPIRED: "Ta session a expiré : reconnecte-toi.",
  // Lot 32 : compte banni (connexion refusée).
  BANNED: "Ce compte a été banni d'Orasso. Pour contester, réponds à l'e-mail qui t'a été envoyé.",
};
export const authErrorFallback = "La connexion n'a pas abouti. Réessaie.";

/** Ce qui vaut dans les deux cas (docs/01). */
export const profileVisibilityAlways =
  "Dans tous les cas : l'organisateur voit tout de ses inscrits et de ses abonnés, les profils sont réservés aux utilisateurs connectés, et ta plaque n'est jamais publique.";

/** Compte protégé par une clé d'accès seulement, connecté dans l'appli par mot de passe (lot 16) : l'action se fait sur le site. */
export const passkeyOnlyMessage =
  "Ton compte est protégé par une clé d'accès : fais cette action sur le site, connecté avec ta clé.";
export const passkeyOnlyButton = "Ouvrir la sécurité sur le site";
