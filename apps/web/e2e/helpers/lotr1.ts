// Lot R1 (retours de Damien du 24/10) : événements de recette de MéditeSportCar pour l'Explorer, l'un terminé il y a
// une heure, l'autre sur plusieurs jours et encore en cours. Créés par l'API (publiés), puis leurs dates passées posées
// en base (la publication exige un début à venir). Aucune date figée : tout part de maintenant.
import { expect } from "@playwright/test";
import { apiCall, unique } from "../helpers";
import { sql } from "./lot48";

export type R1Events = { over: { slug: string; title: string }; running: { slug: string; title: string } };

async function create(damien: string, structureId: string, title: string) {
  const start = new Date(Date.now() + 5 * 86_400_000);
  const created = await apiCall<{ id: string; slug: string }>(damien, "POST", `/structures/${structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 4 * 3600_000).toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car"],
    capacity: 40,
    maxVehiclesPerUser: 1,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Départs au pas.",
    description: "Événement de recette du lot R1.",
  });
  expect(created.status).toBe(201);
  expect((await apiCall(damien, "POST", `/events/${created.data.id}/publish`)).status).toBe(200);
  return { id: created.data.id, slug: created.data.slug, title };
}

export async function r1Events(damien: string): Promise<R1Events> {
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  if (!structureId) throw new Error("Seed : MéditeSportCar introuvable");
  const tag = `R1${unique()}`;
  const over = await create(damien, structureId, `Terminé ${tag}`);
  const running = await create(damien, structureId, `En cours ${tag}`);
  // Terminé il y a une heure ; commencé avant-hier et fini dans trois heures (plusieurs jours).
  await sql(
    "update events set starts_at = now() - interval '4 hours', ends_at = now() - interval '1 hour' where id = $1",
    [over.id],
  );
  await sql(
    "update events set starts_at = now() - interval '2 days', ends_at = now() + interval '3 hours' where id = $1",
    [running.id],
  );
  return { over, running };
}

/** Les titres des événements à venir de MéditeSportCar (ce que « Médite » doit trouver). */
export async function mediteTitles(): Promise<string[]> {
  const rows = await sql<{ title: string }>(
    `select e.title from events e join structures s on s.id = e.structure_id
     where s.slug = 'meditesportcar' and e.status = 'published' and e.admission <> 'invite_only' and e.ends_at >= now()`,
  );
  return rows.map((r) => r.title);
}
