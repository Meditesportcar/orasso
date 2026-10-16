// Recherche de premier niveau (lot 29, ARCHITECTURE-SUITE § 13.1) : `GET /search?q=&limit=5` regroupe cinq recherches.
import { z } from "zod";

import type { Grade } from "../grades";
import type { CrewCard } from "./crews";
import type { EventCard } from "./event";
import type { ProCard } from "./pro";
import type { PersonCard } from "./social";

/** Longueur minimale du texte : en dessous, une recherche ne dit rien et énumère trop. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 60;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH),
  /** Résultats par groupe (5 par défaut, 10 au plus). */
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Groupes de la recherche de premier niveau, dans l'ordre d'affichage. */
export const searchGroups = ["events", "pros", "people", "vehicles", "crews"] as const;
export type SearchGroup = (typeof searchGroups)[number];

/** Un véhicule trouvé, avec son propriétaire. Compte privé que l'on ne connaît pas : marque + modèle, sans photo. */
export type SearchVehicleHit = {
  id: string;
  label: string;
  photoUrl: string | null;
  owner: { userId: string; pseudo: string; avatarUrl: string | null; grade: Grade };
};

/** Un crew trouvé : la carte du lot 19 (nom, logo, département, nombre de membres), jamais la liste des membres. */
export type SearchCrewHit = CrewCard;

export type SearchResults = {
  q: string;
  /** Faux sans connexion : seuls les événements et les pros sont cherchés. */
  authenticated: boolean;
  events: EventCard[];
  pros: ProCard[];
  people: PersonCard[];
  vehicles: SearchVehicleHit[];
  crews: SearchCrewHit[];
  /** Vrai quand le groupe a plus de résultats que `limit` : « Voir tout » renvoie vers le segment d'Explorer. */
  more: Record<SearchGroup, boolean>;
};
