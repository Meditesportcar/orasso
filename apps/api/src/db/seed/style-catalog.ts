// Catalogue de départ des styles (lot R5a, maquette R5.2 validée par Damien le 26/10, listes de `STY`) : styles par type
// de véhicule, rangés par famille, dans l'ordre d'affichage. Il arrive dans les bases par `syncStyleCatalog` (au
// démarrage de l'API et dans le seed) : chaque slug n'est adopté qu'une fois, puis l'admin le gère sans code (R5.3).
// Les slugs existants sont gardés (critères d'événement, Explorer, centres d'intérêt, certification s'en servent).
// Pays (JDM, Allemande…) : famille `pays`, dans la ligne « Origine » verrouillée ; leurs pays et la liste blanche de
// Supercar restent posés par `applyCategoryRules` (scripts/seed/garage.ts).
import type { CategoryFamily, CategoryIcon } from "@orasso/shared";
import { OFFROAD_TYPE } from "@orasso/shared";

export type CatalogStyle = {
  slug: string;
  label: string;
  /** Au masculin, pour un camion (« Ancien », « Préparé »). */
  labelM?: string;
  family: CategoryFamily;
  icon: CategoryIcon;
  /** Types admis (`car`, `moto`, `truck`, `offroad` : voitures tout-terrain) ; null : tous. */
  types: string[] | null;
  minVehicleAge?: number;
  countries?: string[];
  /** En pause : ne se propose plus, reste sur les véhicules qui l'ont. */
  paused?: boolean;
};

const CAR = ["car"];
const MOTO = ["moto"];
const TRUCK = ["truck"];

export const styleCatalog: readonly CatalogStyle[] = [
  // Époque : tous les types.
  { slug: "youngtimer", label: "Youngtimer", family: "epoque", icon: "wait", types: null, minVehicleAge: 20 },
  {
    slug: "ancienne",
    label: "Ancienne",
    labelM: "Ancien",
    family: "epoque",
    icon: "star",
    types: null,
    minVehicleAge: 30,
  },
  // Genre : Roadster avant Sportive (ordre moto de la maquette), puis les voitures, les motos, les camions.
  { slug: "roadster", label: "Roadster", family: "genre", icon: "moto", types: MOTO },
  { slug: "sportive", label: "Sportive", family: "genre", icon: "power", types: ["car", "moto"] },
  { slug: "supercar", label: "Supercar", family: "genre", icon: "spark", types: CAR },
  { slug: "cabriolet", label: "Cabriolet", family: "genre", icon: "weatherClear", types: CAR },
  // « 4x4 » : voitures tout-terrain du référentiel seulement (lot M1, tour 2) ; le camion a « Tout-terrain ».
  { slug: "4x4", label: "4x4", family: "genre", icon: "mount", types: [OFFROAD_TYPE] },
  { slug: "supermotard", label: "Supermotard", family: "genre", icon: "mount", types: MOTO },
  { slug: "trail", label: "Trail", family: "genre", icon: "explore", types: MOTO },
  { slug: "custom", label: "Custom", family: "genre", icon: "spark", types: MOTO },
  { slug: "cafe-racer", label: "Café racer", family: "genre", icon: "moto", types: MOTO },
  { slug: "scrambler", label: "Scrambler", family: "genre", icon: "mount", types: MOTO },
  { slug: "touring", label: "Touring", family: "genre", icon: "map", types: MOTO },
  { slug: "enduro-cross", label: "Enduro / Cross", family: "genre", icon: "mount", types: MOTO },
  { slug: "poids-lourd", label: "Poids lourd", family: "genre", icon: "truck", types: TRUCK },
  { slug: "americain", label: "Américain", family: "genre", icon: "truck", types: TRUCK },
  { slug: "pick-up", label: "Pick-up", family: "genre", icon: "truck", types: TRUCK },
  { slug: "fourgon-amenage", label: "Fourgon aménagé", family: "genre", icon: "home", types: TRUCK },
  // Préparation. « Origine » s'affiche « D'origine » (non modifiée), pour ne plus la confondre avec le pays.
  { slug: "origine", label: "D'origine", family: "preparation", icon: "drop", types: null },
  { slug: "preparee", label: "Préparée", labelM: "Préparé", family: "preparation", icon: "wrench", types: null },
  { slug: "stance", label: "Stance", family: "preparation", icon: "layers", types: CAR },
  { slug: "restomod", label: "Restomod", family: "preparation", icon: "undo", types: CAR },
  { slug: "show-truck", label: "Show truck", family: "preparation", icon: "spark", types: TRUCK },
  // Pratique.
  { slug: "drift", label: "Drift", family: "pratique", icon: "weatherWind", types: CAR },
  { slug: "track-day", label: "Track day", family: "pratique", icon: "flag", types: ["car", "moto"] },
  { slug: "rallye", label: "Rallye", family: "pratique", icon: "explore", types: CAR },
  { slug: "stunt", label: "Stunt", family: "pratique", icon: "undo", types: MOTO },
  { slug: "tout-terrain", label: "Tout-terrain", family: "pratique", icon: "mount", types: ["moto", "truck"] },
  // Pays : la ligne « Origine » verrouillée (déduite du pays de la marque).
  { slug: "jdm", label: "JDM", family: "pays", icon: "flag", types: null, countries: ["JP"] },
  { slug: "allemande", label: "Allemande", family: "pays", icon: "flag", types: null, countries: ["DE"] },
  { slug: "francaise", label: "Française", family: "pays", icon: "flag", types: null, countries: ["FR"] },
  { slug: "italienne", label: "Italienne", family: "pays", icon: "flag", types: null, countries: ["IT"] },
  { slug: "americaine", label: "Américaine", family: "pays", icon: "flag", types: null, countries: ["US"] },
  // En pause : le type de véhicule le dit déjà ; elles restent sur les véhicules qui les ont.
  { slug: "moto", label: "Moto", family: "genre", icon: "moto", types: MOTO, paused: true },
  { slug: "utilitaire", label: "Utilitaire", family: "genre", icon: "truck", types: TRUCK, paused: true },
];
