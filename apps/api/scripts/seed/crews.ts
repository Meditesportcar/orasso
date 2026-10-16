// Lot 19 : crew de démonstration, créé par les vrais services (discussion, messages d'information, notifications).
// « Roussillon Drift » : chef Kenji, membres Léa, Nina, Théo, Julie ; invitation en attente pour Marc, demande en
// attente de Pilote_001 (Boîte > Demandes de Kenji). Inscription en crew sur « Expo Rivesaltes » : Kenji (en attente
// de tri), Léa (venue confirmée), Nina (venue à confirmer). Idempotent : rien si le crew existe déjà.
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { startJobs } from "../../src/jobs";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { crewRegistrationService } from "../../src/modules/crews/registration";
import { crewsService } from "../../src/modules/crews/service";
import { messagingService } from "../../src/modules/messaging/service";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await byPseudo(pseudo);
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

async function firstCar(userId: string) {
  const [v] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .where(and(eq(t.vehicles.ownerId, userId), eq(t.vehicles.status, "active"), eq(t.vehicles.vehicleType, "car")))
    .orderBy(t.vehicles.createdAt)
    .limit(1);
  return v?.id ?? null;
}

export async function seedCrews() {
  if (await db.query.crews.findFirst({ where: eq(t.crews.slug, "roussillon-drift") })) {
    console.log("Crews : « Roussillon Drift » déjà présent.");
    return;
  }
  const [kenji, lea, nina, theo, julie, marc, pilote] = await Promise.all(
    ["Kenji_66", "Lea_11", "Nina_34", "Theo_66", "Julie_66", "Marc_66", "Pilote_001"].map(viewer),
  );
  if (!kenji || !lea || !nina || !theo || !julie || !marc) {
    console.log("Crews : comptes de démonstration absents, rien ajouté.");
    return;
  }
  const crew = await crewsService.create(kenji, {
    name: "Roussillon Drift",
    description: "Glisse, japonaises et sorties du dimanche entre Perpignan et la côte. Chef : Kenji.",
    department: "66",
  });
  await crewsService.request(lea, crew.id, "Salut Kenji, je peux venir avec la RX-7 ?");
  await crewsService.acceptRequest(kenji, crew.id, lea.user.id);
  for (const p of [nina, theo]) {
    await crewsService.invite(kenji, crew.id, p.profile.pseudo);
    await crewsService.acceptInvitation(p, crew.id);
  }
  await crewsService.request(julie, crew.id, null);
  await crewsService.acceptRequest(kenji, crew.id, julie.user.id);
  await crewsService.invite(kenji, crew.id, marc.profile.pseudo);
  if (pilote) await crewsService.request(pilote, crew.id, "Je roule en S13, je peux rejoindre ?");

  const view = await crewsService.viewById(kenji, crew.id);
  if (view.conversationId) {
    await messagingService.send(kenji, view.conversationId, {
      clientId: randomUUID(),
      body: "Bienvenue à tous ! On se cale l'Expo Rivesaltes ensemble ?",
    });
    await messagingService.send(lea, view.conversationId, {
      clientId: randomUUID(),
      body: "Partante, je confirme dès que tu inscris le crew.",
    });
  }

  // Inscription en crew sur « Expo Rivesaltes » : Kenji, Léa (confirme), Nina (laisse en attente).
  const expo = await db.query.events.findFirst({ where: eq(t.events.slug, "expo-rivesaltes-2026") });
  const cars = await Promise.all([kenji, lea, nina].map((p) => firstCar(p.user.id)));
  if (!expo || cars.some((c) => !c)) {
    console.log("Crews : « Roussillon Drift » créé ; Expo Rivesaltes ou véhicules absents, pas d'inscription en crew.");
    return;
  }
  const busy = await db
    .select({ id: t.applications.id })
    .from(t.applications)
    .where(
      and(
        eq(t.applications.eventId, expo.id),
        inArray(t.applications.userId, [kenji.user.id, lea.user.id, nina.user.id]),
        inArray(t.applications.status, ["pending", "accepted", "waitlisted", "offered", "awaiting_member"]),
      ),
    );
  if (busy.length) {
    console.log(
      "Crews : « Roussillon Drift » créé ; Kenji, Léa ou Nina déjà candidat à l'Expo, pas d'inscription en crew.",
    );
    return;
  }
  // Tâche d'expiration de la venue de Nina planifiée comme une vraie inscription (exécutée par l'API).
  const boss = await startJobs({ work: false });
  try {
    await registerOnExpo(expo.id, crew.id, [kenji, lea, nina], cars as string[]);
  } finally {
    await boss.stop({ graceful: true });
  }
  console.log(
    "Crews : « Roussillon Drift » (Kenji chef, Léa, Nina, Théo, Julie ; invitation de Marc et demande de Pilote_001 en attente), inscrit à l'Expo Rivesaltes (Léa confirmée, Nina à confirmer).",
  );
}

async function registerOnExpo(eventId: string, crewId: string, people: Viewer[], cars: string[]) {
  const [kenji, lea, nina] = people as [Viewer, Viewer, Viewer];
  const registration = await crewRegistrationService.register(kenji, eventId, {
    crewId,
    members: [
      { userId: kenji.user.id, vehicleId: cars[0] as string },
      { userId: lea.user.id, vehicleId: cars[1] as string },
      { userId: nina.user.id, vehicleId: cars[2] as string },
    ],
    rulesAccepted: true,
    followStructure: true,
    message: null,
  });
  const leaApp = registration.members.find((m) => m.pseudo === lea.profile.pseudo);
  if (leaApp) {
    await crewRegistrationService.confirm(lea, leaApp.applicationId, {
      rulesAccepted: true,
      followStructure: true,
      companions: 0,
      message: null,
    });
  }
}
