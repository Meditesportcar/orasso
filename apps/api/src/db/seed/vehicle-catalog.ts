// Référentiel complet des véhicules (lot R3c) : la liste de départ (`vehicle-reference.ts`, lot 05, inchangée) plus
// les compléments écrits en texte (`vehicle-reference-*.ts`). Méthode et sources : docs/JOURNAL-DES-CHOIX.md, « Lot R3c ».
// Arrive dans les bases par `syncVehicleReference` (ajoute ce qui manque, ne renomme ni ne supprime rien).
//
// Format des compléments, une ligne par modèle :
//   @ Peugeot | FR                 marque et pays (ISO 3166-1 alpha-2) ; « @ Yamaha | JP | moto » : type par défaut
//   207 : Phase 1 2006-2009 ; Phase 2 2009-2014
//   Partner [truck] : I 1996-2008 ; II 2008-2018 ; III 2018-
//   Niva [4x4] : 2121 1977-        [moto], [truck], [car] changent le type ; [4x4] marque un vrai tout-terrain
//   107 : 2005-2014                une génération sans nom prend le nom du modèle
// Les lignes vides et celles qui commencent par « # » suivi d'une espace sont ignorées (« #1 » est un modèle Smart). Une marque déjà présente reçoit seulement les
// modèles et générations qui lui manquent (fusion par slug du modèle et nom de génération).

import { slugify } from "../../lib/slug";
import { type RefGeneration, type RefMake, type RefModel, vehicleReference } from "./vehicle-reference";
import { vehicleCarsEurope } from "./vehicle-reference-cars-europe";
import { vehicleCarsWorld } from "./vehicle-reference-cars-world";
import { vehicleMotos } from "./vehicle-reference-motos";
import { vehicleUtility } from "./vehicle-reference-utility";

const GENERATION = /^(?:(.*\S)\s+)?(\d{4})-(\d{4})?$/;
const MODEL = /^(.+?)(?:\s+\[([a-z0-9, ]+)\])?\s+:\s+(.+)$/;
const MAKE = /^@\s+(.+?)\s+\|\s+([A-Z]{2})(?:\s+\|\s+(car|moto|truck))?$/;

/** Lit un texte de compléments (format ci-dessus) ; une ligne illisible est une erreur, avec son numéro. */
export function parseReference(text: string, source = "référentiel"): RefMake[] {
  const makes: RefMake[] = [];
  let current: RefMake | null = null;
  let defaultType: RefModel["type"] = "car";
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (!line || line === "#" || line.startsWith("# ")) continue;
    const fail = (why: string) => new Error(`${source}, ligne ${i + 1} : ${why} (« ${line} »)`);
    const make = MAKE.exec(line);
    if (make) {
      current = { name: make[1] as string, country: make[2] as string, models: [] };
      defaultType = (make[3] as RefModel["type"] | undefined) ?? "car";
      makes.push(current);
      continue;
    }
    if (!current) throw fail("modèle avant toute marque");
    const model = MODEL.exec(line);
    if (!model) throw fail("ligne illisible");
    const name = (model[1] as string).trim();
    const flags = (model[2] ?? "").split(/[\s,]+/).filter(Boolean);
    let type = defaultType;
    let offroad = false;
    for (const flag of flags) {
      if (flag === "car" || flag === "moto" || flag === "truck") type = flag;
      else if (flag === "4x4") offroad = true;
      else throw fail(`option inconnue ${flag}`);
    }
    const generations: RefGeneration[] = (model[3] as string).split(";").map((part) => {
      const gen = GENERATION.exec(part.trim());
      if (!gen) throw fail(`génération illisible « ${part.trim()} »`);
      return { name: gen[1] ?? name, yearFrom: Number(gen[2]), yearTo: gen[3] ? Number(gen[3]) : null };
    });
    current.models.push({ name, type, ...(offroad ? { offroad: true as const } : {}), generations });
  }
  return makes;
}

const genKey = (name: string) => slugify(name);

/**
 * Fusionne des compléments dans une liste : marque par slug, modèle par slug dans sa marque, génération par nom
 * (sans accents ni casse). Ce qui existe déjà garde son nom, son type et ses années ; seul ce qui manque s'ajoute.
 */
export function mergeReference(base: readonly RefMake[], ...extras: readonly RefMake[][]): RefMake[] {
  const out: RefMake[] = base.map((m) => ({
    ...m,
    models: m.models.map((x) => ({ ...x, generations: [...x.generations] })),
  }));
  const makes = new Map(out.map((m) => [slugify(m.name), m]));
  for (const extra of extras) {
    for (const make of extra) {
      let target = makes.get(slugify(make.name));
      if (!target) {
        target = { name: make.name, country: make.country, models: [] };
        makes.set(slugify(make.name), target);
        out.push(target);
      }
      const models = new Map(target.models.map((x) => [slugify(x.name), x]));
      for (const model of make.models) {
        const existing = models.get(slugify(model.name));
        if (!existing) {
          const added = { ...model, generations: [...model.generations] };
          target.models.push(added);
          models.set(slugify(model.name), added);
          continue;
        }
        const gens = new Set(existing.generations.map((g) => genKey(g.name)));
        for (const g of model.generations) {
          if (gens.has(genKey(g.name))) continue;
          existing.generations.push(g);
          gens.add(genKey(g.name));
        }
        if (model.offroad && !existing.offroad) existing.offroad = true;
      }
    }
  }
  return out;
}

/** Le référentiel complet : liste de départ, puis voitures, motos, utilitaires. */
export const vehicleCatalog: RefMake[] = mergeReference(
  vehicleReference,
  parseReference(vehicleCarsEurope, "vehicle-reference-cars-europe"),
  parseReference(vehicleCarsWorld, "vehicle-reference-cars-world"),
  parseReference(vehicleMotos, "vehicle-reference-motos"),
  parseReference(vehicleUtility, "vehicle-reference-utility"),
);
