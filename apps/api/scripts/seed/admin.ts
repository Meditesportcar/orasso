// Lot 33 : administration de démonstration. Réglages par défaut écrits (rien n'est changé s'ils existent), un second
// super admin « Equipe_Orasso » (sans structure : il voit le mode assistance), une newsletter en brouillon, deux
// abonnés à la newsletter, une demande d'aide ouverte (« Roues Libres 66 »), trois véhicules « Autre » dans la file.
// Idempotent, et sans règle de date qui échoue sur une base de plusieurs jours (une demande d'aide échue est close et
// remplacée).
import { ASSISTANCE_MAX_MS, adminSettingDefaults, adminSettingKeys } from "@orasso/shared";
import { and, eq, like, lte, sql } from "drizzle-orm";

import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { createAccount, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** Véhicules de la file « Autre » : description reconnaissable (marqueur d'idempotence). */
const OTHER_MARK = "[Autre] ";

export async function seedAdmin(hash: string) {
  // Réglages par défaut (valeurs des constantes) : écrits une fois, jamais écrasés.
  for (const key of adminSettingKeys) {
    await db.insert(t.platformSettings).values({ key, value: adminSettingDefaults[key] }).onConflictDoNothing();
  }

  if (!(await byPseudo("Equipe_Orasso"))) {
    await createAccount(
      hash,
      { pseudo: "Equipe_Orasso", email: "equipe@orasso.local", firstName: "Équipe", departments: ["66"] },
      { platformRole: "super_admin" },
    );
  }
  const damien = await byPseudo("Damien_66");

  // Newsletter : un brouillon, deux abonnés à l'adresse confirmée.
  if (!(await db.query.newsletters.findFirst({ where: eq(t.newsletters.subject, "Orasso : la saison 2027 arrive") }))) {
    await db.insert(t.newsletters).values({
      subject: "Orasso : la saison 2027 arrive",
      bodyMd: [
        "# La saison 2027 arrive",
        "",
        "Bonjour à toutes et à tous,",
        "",
        "Les premiers événements de la saison sont en ligne. Au programme :",
        "- des **rassemblements** dans tout l'Occitanie ;",
        "- les *nouveaux grades* et leurs avantages chez les pros partenaires.",
        "",
        "Rendez-vous sur [orasso.fr](https://orasso.fr).",
      ].join("\n"),
      createdBy: damien?.userId ?? null,
    });
  }
  for (const pseudo of ["Kenji_66", "Lea_11"]) {
    const p = await byPseudo(pseudo);
    if (!p) continue;
    await db.update(t.profiles).set({ newsletterOptIn: true }).where(eq(t.profiles.userId, p.userId));
    await db.update(t.user).set({ emailVerified: true }).where(eq(t.user.id, p.userId));
  }

  // Demande d'aide ouverte (structure de Sarah, pas MéditeSportCar : la recette y montre le refus puis la demande).
  const roues = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const sarah = await byPseudo("Sarah_66");
  if (roues && sarah) {
    await db
      .update(t.assistanceRequests)
      .set({ status: "closed", closedAt: now, closeReason: "expired" })
      .where(
        and(
          eq(t.assistanceRequests.structureId, roues.id),
          eq(t.assistanceRequests.status, "open"),
          lte(t.assistanceRequests.createdAt, new Date(now.getTime() - ASSISTANCE_MAX_MS)),
        ),
      );
    await db
      .insert(t.assistanceRequests)
      .values({
        structureId: roues.id,
        requestedBy: sarah.userId,
        message: "Je n'arrive pas à mettre à jour le logo de la structure, pouvez-vous m'aider ?",
      })
      .onConflictDoNothing();
  }

  // Trois véhicules « Autre » : marque inconnue, modèle inconnu d'une marque, génération inconnue d'un modèle.
  const [already] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.vehicles)
    .where(like(t.vehicles.description, `${OTHER_MARK}%`));
  if ((already?.n ?? 0) > 0) {
    console.log("Administration : file « Autre » déjà présente.");
    return;
  }
  const otherMake = await db.query.vehicleMakes.findFirst({ where: eq(t.vehicleMakes.isOther, true) });
  const otherOfMake = otherMake
    ? await db.query.vehicleModels.findFirst({ where: eq(t.vehicleModels.makeId, otherMake.id) })
    : undefined;
  const porsche = await db.query.vehicleMakes.findFirst({ where: eq(t.vehicleMakes.name, "Porsche") });
  const porscheOther = porsche
    ? await db.query.vehicleModels.findFirst({
        where: and(eq(t.vehicleModels.makeId, porsche.id), eq(t.vehicleModels.isOther, true)),
      })
    : undefined;
  const known = await db
    .select({ model: t.vehicleModels, make: t.vehicleMakes })
    .from(t.vehicleModels)
    .innerJoin(t.vehicleMakes, eq(t.vehicleMakes.id, t.vehicleModels.makeId))
    .where(and(eq(t.vehicleModels.isOther, false), eq(t.vehicleMakes.isOther, false), eq(t.vehicleModels.vehicleType, "car")))
    .limit(1);
  const genOther = known[0]
    ? await db.query.vehicleGenerations.findFirst({
        where: and(eq(t.vehicleGenerations.modelId, known[0].model.id), eq(t.vehicleGenerations.isOther, true)),
      })
    : undefined;
  const owners = await Promise.all(["Pilote_004", "Pilote_005", "Pilote_006"].map(byPseudo));
  const rows = [
    otherMake && otherOfMake && owners[0]
      ? {
          ownerId: owners[0].userId,
          makeId: otherMake.id,
          modelId: otherOfMake.id,
          description: `${OTHER_MARK}Alpine A110 Berlinette 1600 S de 1972, bleu Alpine.`,
          year: 1972,
        }
      : null,
    porsche && porscheOther && owners[1]
      ? {
          ownerId: owners[1].userId,
          makeId: porsche.id,
          modelId: porscheOther.id,
          description: `${OTHER_MARK}Porsche 914/6, rare, restaurée en 2019.`,
          year: 1970,
        }
      : null,
    known[0] && genOther && owners[2]
      ? {
          ownerId: owners[2].userId,
          makeId: known[0].make.id,
          modelId: known[0].model.id,
          generationId: genOther.id,
          description: `${OTHER_MARK}Série spéciale japonaise importée, génération absente de la liste.`,
          year: 2004,
        }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  for (const r of rows) {
    await db.insert(t.vehicles).values({ vehicleType: "car", unregistered: true, ...r });
  }
  console.log(`Administration : ${rows.length} véhicules « Autre », newsletter en brouillon, demande d'aide ouverte.`);
}
