// Aides des tests du lot R8n1 (notifications d'un événement) : personnes, places (candidature ou billet), publications.
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { createEvent, createStructure, createVehicle, signUp, type TestUser } from "../../../test/helpers";
import { db } from "../../db/client";
import {
  applications,
  eventNotificationPrefs,
  feedPosts,
  orders,
  profiles,
  signingKeys,
  tickets,
  ticketTypes,
} from "../../db/schema";

type Ref = Parameters<typeof createVehicle>[1];

/** Candidature véhicule de `u` à l'événement, au statut donné. */
export async function apply(
  u: TestUser,
  eventId: string,
  ref: Ref,
  status: (typeof applications.$inferInsert)["status"] = "accepted",
) {
  const car = await createVehicle(u.id, ref);
  const [row] = await db
    .insert(applications)
    .values({ eventId, userId: u.id, vehicleId: car.id, status, rulesAcceptedAt: new Date(), followStructure: false })
    .returning();
  return row!;
}

/** Billet de `u` à l'événement, sans passer par la billetterie. */
export async function ticket(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled" = "valid") {
  const existing = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.eventId, eventId) });
  const [type] = existing
    ? [existing]
    : await db.insert(ticketTypes).values({ eventId, name: "Entrée visiteur", capacity: 100 }).returning();
  const [order] = await db
    .insert(orders)
    .values({
      eventId,
      userId: u.id,
      ticketTypeId: type!.id,
      status: "paid",
      quantity: 1,
      amountCents: 0,
      paidAt: new Date(),
    })
    .returning();
  await db
    .insert(signingKeys)
    .values({ kid: 1, publicKey: Buffer.alloc(32) })
    .onConflictDoNothing();
  await db.insert(tickets).values({
    orderId: order!.id,
    eventId,
    userId: u.id,
    ticketTypeId: type!.id,
    status,
    kid: 1,
    signature: Buffer.from("00", "hex"),
    issuedAt: new Date(),
  });
}

/** Une organisation (propriétaire à second facteur) et un événement publié dans huit jours. */
export async function organizerWithEvent(
  startsAt: Date,
  over: Partial<typeof import("../../db/schema").events.$inferInsert> = {},
) {
  const owner = await signUp("Orga_66", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const event = await createEvent(structure.id, { startsAt, ...over });
  return { owner, structure, event };
}

/** Une publication d'organisateur rattachée à l'événement (insérée directement : l'écriture est celle de R8a1). */
export async function organizerPost(
  owner: TestUser,
  structureId: string,
  eventId: string,
  createdAt: Date,
  over: Partial<typeof feedPosts.$inferInsert> = {},
) {
  const id = randomUUID();
  await db.insert(feedPosts).values({
    id,
    authorId: owner.id,
    persona: "organizer",
    structureId,
    eventId,
    eventRole: "organizer",
    department: "66",
    createdAt,
    ...over,
  });
  return id;
}

export const muteNews = (u: TestUser, eventId: string) =>
  db.insert(eventNotificationPrefs).values({ userId: u.id, eventId, news: false });

export const setPrefs = (u: TestUser, prefs: Record<string, boolean>, mutedTypes: string[] = []) =>
  db
    .update(profiles)
    .set({ notificationPrefs: prefs as never, mutedTypes })
    .where(eq(profiles.userId, u.id));
