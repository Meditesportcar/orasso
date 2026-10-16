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

/** Format de la fiche à partager : story 9:16 ou publication 1:1. */
export const shareFormats = ["story", "post"] as const;
export type ShareFormat = (typeof shareFormats)[number];

/** Dimensions (px) des fiches Instagram. */
export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1080 },
};

/** Délai sans réponse de l'ancien propriétaire avant l'arbitrage de l'équipe (S36). */
export const PLATE_TRANSFER_DELAY_DAYS = 7;

/** Sans participation pendant ce nombre de mois, la certification est perdue (docs/01). */
export const CERTIFICATION_INACTIVITY_MONTHS = 6;

/** Conditions d'une demande de certification (S37) : minimum de photos. */
export const CERTIFICATION_MIN_PHOTOS = 3;
