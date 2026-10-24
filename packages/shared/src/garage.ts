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
 * Fondu de la photo carrée sur l'affiche (`.a-ph`), en fractions de son côté : elle apparaît de 0 à 7 % et s'efface de
 * 78 % à 100 %. Partagé avec le rendu de l'API (`share-story.ts`).
 */
export const SHARE_PHOTO_FADE = { inEnd: 0.07, outStart: 0.78 } as const;

/** Haut du voile du bas de l'affiche (fraction de la hauteur) : 40 % en story, 44 % en post. */
export const shareVeilFrom = (format: ShareFormat): number => (format === "story" ? 0.4 : 0.44);

/**
 * Voile du bas de l'affiche (couleur du fond), du haut du voile jusqu'en bas : arrêts [position 0–1, opacité], par
 * format et par style (Sable plus couvrant ; Nuit et Néon identiques). Partagé avec le rendu de l'API.
 */
export function shareVeilStops(format: ShareFormat, style: ShareStyle): readonly (readonly [number, number])[] {
  if (style === "sand") {
    return format === "story"
      ? [
          [0, 0],
          [0.26, 0.9],
          [0.62, 1],
          [1, 0.55],
        ]
      : [
          [0, 0],
          [0.34, 0.92],
          [0.66, 1],
        ];
  }
  return format === "story"
    ? [
        [0, 0],
        [0.26, 0.86],
        [0.64, 0.93],
        [1, 0.5],
      ]
    : [
        [0, 0],
        [0.34, 0.88],
        [0.66, 1],
      ];
}

const at = (stops: readonly (readonly [number, number])[], u: number): number => {
  if (u <= 0) return stops[0]?.[1] ?? 0;
  for (let i = 1; i < stops.length; i++) {
    const [u1, v1] = stops[i] as readonly [number, number];
    const [u0, v0] = stops[i - 1] as readonly [number, number];
    if (u <= u1) return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1);
  }
  return stops.at(-1)?.[1] ?? 0;
};

/**
 * Lot R3a, tour 2 : part visible de la photo à la hauteur `y` (px) de l'affiche, de 0 à 1 : fondu de la photo carrée,
 * puis voile du bas. Le reste de l'affiche est le prolongement flouté de la photo (illisible).
 */
export function sharePhotoVisibility(format: ShareFormat, style: ShareStyle, y: number): number {
  const { width: W, height: H } = SHARE_SIZES[format];
  const t = (y - sharePhotoTop(format)) / W;
  if (t < 0 || t > 1) return 0;
  const { inEnd, outStart } = SHARE_PHOTO_FADE;
  const photo = t < inEnd ? t / inEnd : t > outStart ? (1 - t) / (1 - outStart) : 1;
  const veilTop = H * shareVeilFrom(format);
  const veil = y < veilTop ? 0 : at(shareVeilStops(format, style), (y - veilTop) / (H - veilTop));
  return photo * (1 - veil);
}

/** Sous ce seuil (voile de plus de 0,8), la photo est tenue pour illisible (correction du coordinateur, tour 2). */
export const SHARE_PHOTO_READABLE = 0.2;

/** Bande (px) où la photo reste lisible : `sharePhotoVisibility` au-dessus de `SHARE_PHOTO_READABLE`. */
export function shareReadableBand(format: ShareFormat, style: ShareStyle): { top: number; bottom: number } {
  const H = SHARE_SIZES[format].height;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y <= H; y++) {
    if (sharePhotoVisibility(format, style, y) >= SHARE_PHOTO_READABLE) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return top < 0 ? { top: 0, bottom: 0 } : { top, bottom };
}

/** Une zone de l'affiche, normalisée (0–1) comme les cadres de plaque. */
export type ShareZone = { x: number; y: number; w: number; h: number };

/** Agrandissement des cadres de plaque détectés (`PLATE_GROW` de l'appli) : on le retire avant de comparer. */
const DETECT_GROW = 0.15;
/** Part d'un cadre dans les textes d'Orasso au-delà de laquelle c'est l'un d'eux qui a été lu. */
const TEXT_SHARE = 0.85;

/**
 * Lot R3a, tour 2 (corrections Codex et Opus) : une plaque re-détectée sur l'affiche compte si elle chevauche la partie
 * lisible de la photo, sauf si elle est presque tout entière (85 %) dans les zones réelles des textes qu'Orasso dessine
 * (`texts` : nom, marque, étiquettes, chiffres, pied, QR, et le sceau seulement s'il est dessiné), renvoyées par l'API
 * (`GET /me/vehicles/:id/share-zones`). Une plaque que le sceau ou un texte ne couvre qu'en partie reste signalée.
 */
export function plateOnSharePoster(
  format: ShareFormat,
  style: ShareStyle,
  rect: ShareZone,
  texts: readonly ShareZone[] = [],
): boolean {
  const { height: H } = SHARE_SIZES[format];
  const band = shareReadableBand(format, style);
  const top = rect.y * H;
  const bottom = (rect.y + rect.h) * H;
  if (bottom < band.top || top > band.bottom) return false;
  // Le cadre tel que lu, avant l'agrandissement de la détection.
  const w = rect.w / (1 + DETECT_GROW);
  const h = rect.h / (1 + DETECT_GROW);
  const core = { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
  const area = core.w * core.h;
  if (!(area > 0)) return true;
  const inside = texts.reduce((sum, z) => {
    const ix = Math.max(0, Math.min(core.x + core.w, z.x + z.w) - Math.max(core.x, z.x));
    const iy = Math.max(0, Math.min(core.y + core.h, z.y + z.h) - Math.max(core.y, z.y));
    return sum + ix * iy;
  }, 0);
  return Math.min(1, inside / area) < TEXT_SHARE;
}

/** Délai sans réponse de l'ancien propriétaire avant l'arbitrage de l'équipe (S36). */
export const PLATE_TRANSFER_DELAY_DAYS = 7;

/** Sans participation pendant ce nombre de mois, la certification est perdue (docs/01). */
export const CERTIFICATION_INACTIVITY_MONTHS = 6;

/** Conditions d'une demande de certification (S37) : minimum de photos. */
export const CERTIFICATION_MIN_PHOTOS = 3;
