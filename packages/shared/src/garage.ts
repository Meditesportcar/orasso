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

/** Haut de la photo carrée (px, pleine largeur) sur l'affiche : 4 % de la hauteur en story, remontée de 15 % en post. */
export function sharePhotoTop(format: ShareFormat): number {
  const H = SHARE_SIZES[format].height;
  return Math.round(format === "story" ? 0.04 * H : -0.15 * H);
}

/** Haut du sceau « Véhicule certifié » (px) : 14,5 % de la hauteur en story, 3 % en post. */
export function shareSealTop(format: ShareFormat): number {
  return Math.round(SHARE_SIZES[format].height * (format === "story" ? 0.145 : 0.03));
}

/** Côté du sceau (px) : 23 % de la largeur ; posé à 4 % du bord droit, tourné de -10°. */
export const shareSealSide = (format: ShareFormat): number => Math.round(SHARE_SIZES[format].width * 0.23);

/**
 * Lot R3a (retour 7 de Damien) : la partie nette de la photo sur l'affiche, en fractions de la hauteur et de la largeur.
 * La photo carrée est fondue en haut (7 %) et en bas (à partir de 78 %) ; au-dessous viennent les étiquettes, le nom, les
 * chiffres et le pied (textes d'Orasso). Le sceau, à droite en haut, est aussi un texte d'Orasso.
 */
export function sharePhotoZone(format: ShareFormat): {
  top: number;
  bottom: number;
  seal: { left: number; top: number; bottom: number };
} {
  const { width: W, height: H } = SHARE_SIZES[format];
  const y = sharePhotoTop(format);
  const s = shareSealSide(format);
  // Le sceau tourné déborde un peu de son carré : 30 px de marge.
  const sealTop = shareSealTop(format) - 30;
  return {
    top: Math.max(0, y + 0.07 * W) / H,
    bottom: Math.min(H, y + 0.78 * W) / H,
    seal: { left: (W - 0.04 * W - s - 30) / W, top: Math.max(0, sealTop) / H, bottom: (sealTop + s + 60) / H },
  };
}

/**
 * Lot R3a (retour 7) : une plaque re-détectée sur l'affiche composée ne compte que si elle est sur la photo (son centre
 * dans la partie nette, hors du sceau). Les textes qu'Orasso dessine (nom, marque, @pseudo, adresse, chiffres, sceau)
 * sont ignorés : en Sable, l'un d'eux était lu comme une plaque.
 */
export function plateOnSharePhoto(format: ShareFormat, rect: { x: number; y: number; w: number; h: number }): boolean {
  const zone = sharePhotoZone(format);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  if (cy < zone.top || cy > zone.bottom) return false;
  return !(cx >= zone.seal.left && cy >= zone.seal.top && cy <= zone.seal.bottom);
}

/** Délai sans réponse de l'ancien propriétaire avant l'arbitrage de l'équipe (S36). */
export const PLATE_TRANSFER_DELAY_DAYS = 7;

/** Sans participation pendant ce nombre de mois, la certification est perdue (docs/01). */
export const CERTIFICATION_INACTIVITY_MONTHS = 6;

/** Conditions d'une demande de certification (S37) : minimum de photos. */
export const CERTIFICATION_MIN_PHOTOS = 3;
