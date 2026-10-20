// Seed de démonstration (ARCHITECTURE.md § 7, étape 7), repris des données du prototype validé.
// Usage : pnpm db:seed [--reset] [--small]
//   --reset  vide les données (comptes compris) avant de recommencer ; sans lui, le seed ne fait rien s'il est déjà là.
//   --small  volumes réduits (Nocturne de Canet : 5 à trier, 20 retenus, 6 en liste d'attente, 3 refusés).
// Comptes de démonstration : mot de passe SEED_PASSWORD du .env (voir .env.example), e-mails en @orasso.local.
// Un fichier par domaine dans `scripts/seed/` (lot 15, anti-conflits) : un lot ajoute son module et une ligne dans
// `main()`.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import * as t from "../src/db/schema";
import { storageDir } from "../src/lib/storage";
import { notificationsService } from "../src/modules/notifications/service";
import { seedAdmin } from "./seed/admin";
import { seedAfterEvent } from "./seed/after-event";
import { seedBase } from "./seed/base";
import { seedCasquettes } from "./seed/casquettes";
import { seedCommunication } from "./seed/communication";
import { seedCrews } from "./seed/crews";
import { seedDayJ } from "./seed/day-j";
import { seedExplorer } from "./seed/explorer";
import { seedGarage } from "./seed/garage";
import { seedHome } from "./seed/home";
import { seedHomeProfiles } from "./seed/home-profiles";
import { seedInvitations } from "./seed/invitations";
import { seedMedia } from "./seed/media";
import { seedMessaging } from "./seed/messaging";
import { seedMissions } from "./seed/missions";
import { seedModeration } from "./seed/moderation";
import { seedMultiDay } from "./seed/multi-day";
import { seedOrgaV2 } from "./seed/orga-v2";
import { seedPassport } from "./seed/passport";
import { seedPosters } from "./seed/posters";
import { seedPros } from "./seed/pros";
import { seedProviders } from "./seed/providers";
import { seedSecurity } from "./seed/security";
import { seedSocial } from "./seed/social";
import { seedStaff } from "./seed/staff";
import { seedWeather } from "./seed/weather";

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
// En production (dev.orasso.fr, en ligne), pas de mot de passe par défaut : les comptes du seed incluent un super admin.
if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  console.error("SEED_PASSWORD manquant : obligatoire en production (comptes de démonstration en ligne).");
  process.exit(1);
}
const PASSWORD = process.env.SEED_PASSWORD || "orasso-demo-2026";

const TABLES = [
  "user",
  "categories",
  "vehicle_makes",
  "structures",
  "events",
  "email_outbox",
  "admin_audit_log",
  "notifications",
];

async function reset() {
  await db.execute(sql.raw(`truncate ${TABLES.map((x) => `"${x}"`).join(", ")} cascade`));
  const boss = await db.execute(
    sql`select 1 from information_schema.tables where table_schema = 'pgboss' and table_name = 'job'`,
  );
  if (boss.rows.length) {
    await db.execute(sql`delete from pgboss.job where name like 'event.%' or name like 'waitlist.%'`);
  }
  await rm(join(storageDir, "seed"), { recursive: true, force: true });
  console.log("Données vidées.");
}

// --- Programme ----------------------------------------------------------------------------------------------------
async function main() {
  if (RESET && process.env.NODE_ENV === "production" && !args.has("--force-production")) {
    console.error(
      "--reset efface tous les comptes : refusé en production (ajouter --force-production si c'est voulu).",
    );
    process.exitCode = 1;
    return;
  }
  if (RESET) await reset();
  const hash = await hashPassword(PASSWORD);
  if (await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") })) {
    console.log("Données de base déjà présentes (pnpm db:seed --reset pour recommencer).");
  } else {
    await seedBase(hash);
  }
  // Lot 06 : QR des retenus, jour J (« Salon Argelès »), événement passé réglé, points ; complète un seed existant.
  await seedDayJ(hash);
  // Lot 14 : professionnels (annuaire, remises par grade) et billetterie (billets gratuits, billets payants « bientôt »).
  await seedPros(hash);
  // Lot 15 : compte à confirmer, parrainage.
  await seedSecurity(hash);
  // Lot 28 : prévisions météo factices (Nocturne de Canet mauvaise, Expo Rivesaltes bonne).
  await seedWeather();
  // Lot 17 : amis, demande en attente, profil privé.
  await seedSocial();
  // Lot 16 : seconde structure de Sarah_66 (feuille « Mes casquettes »).
  await seedCasquettes();
  // Lot 21 : prestataires (food truck de Léa, photographe accrédité, stand d'un pro).
  await seedProviders(hash);
  // Lot 31 : règles de cohérence des catégories, véhicule certifié de démonstration.
  await seedGarage();
  // Lot 18 : conversations, demande de contact, organisateur joignable.
  await seedMessaging();
  // Lot 19 : crew « Roussillon Drift », demandes et invitation, inscription en crew sur l'Expo Rivesaltes.
  await seedCrews();
  // Lot 29 : structures, événements et pros localisés en 11, 34 et 31 (Explorer : liste, carte, affinités, distance).
  await seedExplorer(hash);
  // Lot 20 : modèles Orasso, annonce et message groupé sur la Nocturne, discussions du staff.
  await seedCommunication();
  // Lot 24 : rôle boutique du Salon Argelès (billets gratuits, staff boutique) et une demande de staff en attente.
  await seedStaff(hash);
  // Lot 32 : modératrice, signalements, suspension automatique contestée.
  await seedModeration(hash);
  // Lot 25 : événement privé « Soirée partenaires » et ses invitations ; hauts grades sur l'Expo Rivesaltes.
  await seedInvitations();
  // Lot 30 : garage favori de Kenji, deux emplacements sponsorisés (dont un ciblé 66 + JDM), cache factice lavage et carburant.
  await seedHome();
  // Lot 27 : bilan de la Nocturne de rentrée, notes internes, badge qui expire dans 5 jours, structure suspendue.
  await seedAfterEvent(hash);
  // Lot 26 : « Salon de printemps » sur trois jours (accès au choix, 100 places par jour), candidatures mixtes.
  await seedMultiDay();
  // Lot 33 : réglages par défaut, second super admin, newsletter en brouillon, demande d'aide ouverte, file « Autre ».
  await seedAdmin(hash);
  // Lot 45 : média « Sud Cars » de Léo, accréditations presse (acceptée, en attente, refusée), contenus de Béziers Night.
  await seedMedia(hash);
  // Lot 46 : La Brasa (Sofia_66), besoins sur 4 événements, emplacement B2 sur la Nocturne, 2 avis d'organisateur.
  await seedMissions(hash);
  // Lot 49 : 9 tampons pour Kenji (1 rare), prix du public de Béziers Night (64 votants, Kenji 4e), résultats.
  await seedPassport();
  // Lot 47 : créneaux d'arrivée de la Nocturne, notes d'arrivée, affiches générées de tous les événements (en dernier).
  await seedPosters();
  // Lot 43 : billet de Paul (visiteur), remises, vues et abonnés du garage du port pour l'Accueil par profil.
  await seedHomeProfiles();
  // Lot 52 : brouillon incomplet, engagement de l'équipe (bulles), structure en cours de vérification.
  await seedOrgaV2(hash);
}

try {
  await main();
  await notificationsService.flush();
} finally {
  await pool.end();
}
