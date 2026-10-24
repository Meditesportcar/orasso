// Recherche « Marque ou modèle » dans le référentiel (lot R3c). Le référentiel entier (quelques milliers de lignes)
// est indexé en mémoire au premier appel, puis gardé 10 minutes : une recherche ne lit pas la base et reste sous la
// milliseconde ou presque (mesure dans `reference-search.test.ts`). Les ajouts de l'équipe dans l'admin apparaissent
// au plus tard 10 minutes après, comme les listes du référentiel déjà gardées une heure par le cache HTTP.
// Règles de correspondance : `@orasso/shared` (`searchWords`, `searchTokens`, `matchTokens`).

import {
  matchTokens,
  searchFold,
  searchTokens,
  searchWords,
  type VehicleReferenceHit,
  type VehicleReferenceSearchQuery,
  type VehicleType,
} from "@orasso/shared";

import { db } from "../../db/client";
import { vehicleGenerations, vehicleMakes, vehicleModels } from "../../db/schema";

const TTL_MS = 10 * 60 * 1000;

/**
 * Noms de passion qui ne sont pas dans le nom du référentiel (« 350Z » pour la Nissan Z de génération Z33, « Miata »
 * pour la MX-5) : mots ajoutés à l'index, par « Marque|Modèle » ou « Marque|Modèle|Génération ». Aucun nom n'est changé.
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  "Nissan|Z|S30": ["240z", "260z", "fairlady"],
  "Nissan|Z|S130": ["280zx"],
  "Nissan|Z|Z31": ["300zx"],
  "Nissan|Z|Z32": ["300zx"],
  "Nissan|Z|Z33": ["350z"],
  "Nissan|Z|Z34": ["370z"],
  "Nissan|Z|RZ34": ["400z"],
  "Toyota|Corolla|AE86": ["trueno", "levin", "hachiroku"],
  "Mazda|MX-5": ["miata", "eunos"],
  "Volkswagen|Coccinelle": ["beetle", "kafer", "cox"],
  "Volkswagen|Combi": ["transporter", "multivan", "bulli"],
  "Citroën|2CV": ["deudeuche"],
  "Renault|4L": ["quatrelle"],
  "Mercedes-Benz|SL|W113": ["pagode"],
  "Mercedes-Benz|Classe G": ["g-wagon", "gelandewagen"],
  "Honda|CBR 900 RR": ["fireblade"],
  "Honda|CBR 1000 RR": ["fireblade"],
  "Lancia|Delta|Mk1": ["integrale"],
  "Land Rover|Série": ["series"],
};
const aliases = (...names: string[]) => (SEARCH_ALIASES[names.join("|")] ?? []).flatMap(searchWords);

type Entry = {
  hit: VehicleReferenceHit;
  /** Mots par niveau : marque, puis modèle, puis génération. */
  levels: string[][];
  /** Types de véhicule couverts (une marque : ceux de ses modèles). */
  types: Set<VehicleType>;
  sortName: string;
};

let cache: { at: number; entries: Entry[] } | null = null;
let loading: Promise<Entry[]> | null = null;

const KIND_ORDER = { make: 0, model: 1, generation: 2 } as const;

async function build(): Promise<Entry[]> {
  const [makes, models, gens] = await Promise.all([
    db.select({ id: vehicleMakes.id, name: vehicleMakes.name, isOther: vehicleMakes.isOther }).from(vehicleMakes),
    db
      .select({
        id: vehicleModels.id,
        makeId: vehicleModels.makeId,
        name: vehicleModels.name,
        type: vehicleModels.vehicleType,
        isOther: vehicleModels.isOther,
      })
      .from(vehicleModels),
    db
      .select({
        id: vehicleGenerations.id,
        modelId: vehicleGenerations.modelId,
        name: vehicleGenerations.name,
        yearFrom: vehicleGenerations.yearFrom,
        yearTo: vehicleGenerations.yearTo,
        isOther: vehicleGenerations.isOther,
      })
      .from(vehicleGenerations),
  ]);
  const entries: Entry[] = [];
  const makeById = new Map<string, { entry: Entry; words: string[]; compact: string }>();
  for (const make of makes) {
    if (make.isOther) continue;
    const words = searchWords(make.name);
    const entry: Entry = {
      hit: {
        kind: "make",
        makeId: make.id,
        makeName: make.name,
        modelId: null,
        modelName: null,
        vehicleType: null,
        generationId: null,
        generationName: null,
        yearFrom: null,
        yearTo: null,
      },
      levels: [words],
      types: new Set(),
      sortName: searchFold(make.name),
    };
    makeById.set(make.id, { entry, words, compact: words[0] ?? "" });
    entries.push(entry);
  }
  const modelById = new Map<string, { entry: Entry; words: string[]; compact: string }>();
  for (const model of models) {
    const make = makeById.get(model.makeId);
    if (model.isOther || !make) continue;
    make.entry.types.add(model.type);
    const own = [...searchWords(model.name), ...aliases(make.entry.hit.makeName, model.name)];
    const compact = searchWords(model.name)[0] ?? "";
    // « peugeot207 » : marque et modèle collés.
    const words = [...own, `${make.compact}${compact}`];
    const entry: Entry = {
      hit: { ...make.entry.hit, kind: "model", modelId: model.id, modelName: model.name, vehicleType: model.type },
      levels: [make.words, words],
      types: new Set([model.type]),
      sortName: `${searchFold(make.entry.hit.makeName)} ${searchFold(model.name)}`,
    };
    modelById.set(model.id, { entry, words, compact });
    entries.push(entry);
  }
  for (const gen of gens) {
    const model = modelById.get(gen.modelId);
    if (gen.isOther || !model) continue;
    const own = [
      ...searchWords(gen.name),
      ...aliases(model.entry.hit.makeName, model.entry.hit.modelName ?? "", gen.name),
    ];
    // « golf4 », « golfmk4 » : modèle et génération collés.
    const words = [...own, ...own.map((w) => `${model.compact}${w}`)];
    entries.push({
      hit: {
        ...model.entry.hit,
        kind: "generation",
        generationId: gen.id,
        generationName: gen.name,
        yearFrom: gen.yearFrom,
        yearTo: gen.yearTo,
      },
      levels: [model.entry.levels[0] ?? [], model.words, words],
      types: model.entry.types,
      sortName: `${model.entry.sortName} ${String(gen.yearFrom ?? 0).padStart(4, "0")} ${searchFold(gen.name)}`,
    });
  }
  return entries;
}

async function index(): Promise<Entry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;
  loading ??= build()
    .then((entries) => {
      cache = { at: Date.now(), entries };
      return entries;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export const referenceSearch = {
  async search({ q, type, limit }: VehicleReferenceSearchQuery): Promise<VehicleReferenceHit[]> {
    const tokens = searchTokens(q);
    if (!tokens.length) return [];
    const scored: { entry: Entry; score: number }[] = [];
    for (const entry of await index()) {
      if (type && !entry.types.has(type)) continue;
      const score = matchTokens(tokens, entry.levels);
      if (score > 0) scored.push({ entry, score });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        KIND_ORDER[a.entry.hit.kind] - KIND_ORDER[b.entry.hit.kind] ||
        a.entry.sortName.localeCompare(b.entry.sortName, "fr", { numeric: true }),
    );
    return scored.slice(0, limit).map((s) => s.entry.hit);
  },
  /** Relit le référentiel à la prochaine recherche (tests, synchronisation). */
  invalidate() {
    cache = null;
  },
};
