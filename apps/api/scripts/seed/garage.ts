// Lot 31 : règles de cohérence des catégories (pays de la marque, type, liste blanche de marques) et un véhicule
// certifié de démonstration. Idempotent ; `applyCategoryRules` est aussi appelé par les tests et par le déploiement.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { Executor } from "../../src/lib/tx";

type Rule = { countries?: string[]; makes?: string[] };

/** ARCHITECTURE-SUITE § 14. Les catégories absentes de la base sont ignorées. */
export const CATEGORY_RULES: Record<string, Rule> = {
  jdm: { countries: ["JP"] },
  allemande: { countries: ["DE"] },
  francaise: { countries: ["FR"] },
  italienne: { countries: ["IT"] },
  americaine: { countries: ["US"] },
  supercar: {
    makes: [
      "Ferrari",
      "Lamborghini",
      "McLaren",
      "Porsche",
      "Bugatti",
      "Aston Martin",
      "Maserati",
      "Lotus",
      "Koenigsegg",
      "Pagani",
    ],
  },
  // Lot R5a : les types admis (Moto, Utilitaire, 4x4…) viennent du catalogue des styles (`styleCatalog`), adopté une
  // seule fois puis géré par l'admin : ce script ne les réécrit plus (il le faisait à chaque seed, donc à chaque
  // déploiement).
};

export async function applyCategoryRules(ex: Executor = db): Promise<number> {
  let applied = 0;
  for (const [slug, rule] of Object.entries(CATEGORY_RULES)) {
    const category = await ex.query.categories.findFirst({ where: eq(t.categories.slug, slug) });
    if (!category) continue;
    await ex
      .update(t.categories)
      .set({
        allowedCountries: rule.countries ?? null,
        makeMode: rule.makes ? "whitelist" : "any",
      })
      .where(eq(t.categories.id, category.id));
    const wanted = rule.makes
      ? (
          await ex
            .select({ id: t.vehicleMakes.id })
            .from(t.vehicleMakes)
            .where(
              inArray(
                sql`lower(${t.vehicleMakes.name})`,
                rule.makes.map((m) => m.toLowerCase()),
              ),
            )
        ).map((m) => m.id)
      : [];
    await ex.delete(t.categoryMakes).where(eq(t.categoryMakes.categoryId, category.id));
    if (wanted.length) {
      await ex.insert(t.categoryMakes).values(wanted.map((makeId) => ({ categoryId: category.id, makeId })));
    }
    applied++;
  }
  return applied;
}

export async function seedGarage() {
  const applied = await applyCategoryRules();
  // Le premier véhicule actif de Damien est certifié pour montrer le badge ; la Supra de Kenji reste à certifier.
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  if (damien) {
    const first = await db.query.vehicles.findFirst({
      where: and(eq(t.vehicles.ownerId, damien.userId), eq(t.vehicles.status, "active")),
      orderBy: [t.vehicles.createdAt],
    });
    if (first && !first.certifiedAt && !first.certifiedLostReason) {
      await db
        .update(t.vehicles)
        .set({
          certifiedAt: new Date(),
          certifiedLostReason: null,
          description: first.description ?? "Garée et entretenue pour la route et quelques sorties circuit.",
        })
        .where(eq(t.vehicles.id, first.id));
    }
  }
  console.log(`Garage : règles de ${applied} catégories, un véhicule certifié de démonstration.`);
}
