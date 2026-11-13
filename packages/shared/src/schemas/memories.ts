// Les souvenirs (lot R7j) : « il y a un an, tu étais à… ». Réponses de `GET /me/memories/today` et `GET /me/memories/:eventId`,
// contenu du bloc de l'Accueil (`memories`) et de la carte du Fil (`memory`). Liste blanche : jamais de plaque (la photo est
// celle de la règle du plateau, plaque floutée ou absente), jamais d'identifiant d'une autre personne.
import type { AlbumMention } from "./albumTags";
import type { PassportStamp } from "./passport";

export type MemoryItem = {
  eventId: string;
  slug: string;
  title: string;
  city: string | null;
  /** Début de l'événement (ISO). */
  startsAt: string;
  /** Années pleines depuis le tampon (1, 2, 3…). */
  yearsAgo: number;
  posterUrl: string | null;
  /** Une photo masquée de ma voiture sur le plateau ; `null` sans voiture montrable (on retombe sur l'affiche). */
  photoUrl: string | null;
  /** Le tampon du souvenir (participation avant visite), de quoi le dessiner sans autre appel. */
  stampId: string;
  stamp: PassportStamp;
  /**
   * Ma voiture retenue sur le plateau (active et à moi) : son nom, son numéro d'arrivée sur le plateau (ordre d'acceptation)
   * et le nombre de voitures du plateau. `null` sans voiture retenue et pointée.
   */
  car: { label: string; rank: number; total: number } | null;
  /** Le récap de l'événement est ouvert (je l'ai vécu : pointé ou billet contrôlé, et l'événement est fini). */
  recapAvailable: boolean;
  /**
   * Lot R9f (T42) : mes photos d'albums de médias à cet événement (ma voiture ou mon pseudo identifiés), par album, six vignettes au
   * plus : « N photos de ta <voiture> · <média> ». Les miennes seules ; **absent** sans identification ; jamais des publications.
   */
  albumPhotos?: AlbumMention[];
};

/** `GET /me/memories/:eventId` : la page du souvenir. */
export type MemoryDetail = MemoryItem & {
  /** Vrai seulement le jour anniversaire ; la page ouverte plus tard dit une formule datée. */
  anniversary: boolean;
  /** « Toyota GR Supra » : la voiture que j'avais ce jour-là, seulement si elle est montrable. */
  vehicleLabel: string | null;
};

/** Bloc « Souvenirs » de l'Accueil : les souvenirs du jour (au moins un, sinon le bloc n'existe pas). */
export type HomeMemoryBlock = { items: MemoryItem[] };

/** Charge utile de la carte du Fil `memory`. */
export type MemoryCardPayload = { memory: MemoryItem };
