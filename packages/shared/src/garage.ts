// Garage et certification (lot 31, ARCHITECTURE-SUITE § 14) : énumérations communes à l'API, au site et à l'appli.

/** Demande de certification : traitée à la main par l'équipe Orasso (docs/01 « Points et grades »). */
export const certificationStatuses = ["pending", "accepted", "refused"] as const;
export type CertificationStatus = (typeof certificationStatuses)[number];

/** Pourquoi une certification est perdue : fiche modifiée, ou six mois sans événement (docs/01). */
export const certificationLostReasons = ["modified", "inactive"] as const;
export type CertificationLostReason = (typeof certificationLostReasons)[number];

/** Une catégorie accepte toutes les marques (`any`) ou seulement une liste blanche (`whitelist`, ex. supercar). */
export const categoryMakeModes = ["any", "whitelist"] as const;
export type CategoryMakeMode = (typeof categoryMakeModes)[number];

/** Format de l'affiche à partager : story 9:16 (par défaut) ou post 4:5 (lot M6, maquettes 2.1 et 2.2). */
export const shareFormats = ["story", "post"] as const;
export type ShareFormat = (typeof shareFormats)[number];

/** Style de l'affiche (lot 50, maquettes 2.1 à 2.3) : Nuit (fumée), Sable (papier crème), Néon (liseré moutarde). */
export const shareStyles = ["night", "sand", "neon"] as const;
export type ShareStyle = (typeof shareStyles)[number];
export const SHARE_DEFAULT_STYLE: ShareStyle = "night";

/**
 * Zones que l'interface d'Instagram recouvre sur une story (retour 18 de Damien, maquette 2.3) : la ligne du profil en
 * haut (≈ 13 %) et la barre de réponse en bas (≈ 15 %). Fractions de la hauteur : aucun texte n'y est posé, la photo et
 * son prolongement flouté les remplissent. Le post n'a pas de marges cachées.
 */
export const SHARE_SAFE = { top: 0.13, bottom: 0.15 } as const;

/** Au plus six zones à masquer par le filet de sécurité (plaque re-détectée sur l'affiche composée). */
export const SHARE_MAX_MASKS = 6;

/** Hauteurs en px des deux bandes masquées d'une story de hauteur `height`. */
export function shareSafeBands(height: number): { top: number; bottom: number } {
  return { top: Math.round(height * SHARE_SAFE.top), bottom: Math.round(height * SHARE_SAFE.bottom) };
}

/** Dimensions (px) des fiches Instagram. */
export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
};

/** Délai sans réponse de l'ancien propriétaire avant l'arbitrage de l'équipe (S36). */
export const PLATE_TRANSFER_DELAY_DAYS = 7;

/** Sans participation pendant ce nombre de mois, la certification est perdue (docs/01). */
export const CERTIFICATION_INACTIVITY_MONTHS = 6;

/** Conditions d'une demande de certification (S37) : minimum de photos. */
export const CERTIFICATION_MIN_PHOTOS = 3;
