// Lot R9d, tour 1 : « À trier » dit ce qui reste, jamais au candidat, livraison à un ancien responsable, un seul signal
// `inbox.changed`, demandes traitées, compteurs alignés sur les listes.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  createVehicle,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { feedPostCoauthors, notifications, profiles, structureMembers, structures } from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { dbPost } from "../feed/comments/testkit";
import { notificationsService } from "../notifications/service";
import { notifyStructure } from "../notifications/structure";
import { staffRequestsService } from "../staff/requests";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let damien: TestUser;
let lea: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 11, day: 12, hour: 15, minute: 0 }));
  quietHours(false);
  ref = await seedReference();
  damien = await signUp("Damien_66", { twoFactor: true });
  lea = await signUp("Lea_11", { twoFactor: true });
  structureId = (await createStructure(damien.id)).id;
  await addMember(structureId, lea.id, "co_organizer");
  await db.update(structures).set({ name: "Roues Libres 66" }).where(eq(structures.id, structureId));
});

const mineIn = (u: TestUser) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.structureId, structureId)));

const applyAs = async (u: TestUser, eventId: string) => {
  const car = await createVehicle(u.id, ref);
  const [a] = await applicationsService.apply(await viewerOf(u), eventId, {
    vehicleIds: [car.id],
    rulesAccepted: true,
    followStructure: false,
    newsletterOptIn: false,
    companions: 0,
    message: null,
  } as never);
  if (!a) throw new Error("candidature absente");
  return a;
};

const triageTitle = async (u: TestUser) =>
  (await call(u, "GET", `/structures/${structureId}/activity?filter=triage`)).json.groups[0]?.items[0]?.title;

const unseen = async (u: TestUser) => (await call(u, "GET", `/structures/${structureId}/activity/count`)).json.unseen;

/** Les `inbox.changed` ou `notification` publiés pendant `run`, par canal. */
async function signals(type: string, run: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = [];
  const original = realtime.publish;
  realtime.publish = ((channel: string, t: string) => {
    if (t === type) seen.push(channel);
  }) as never;
  try {
    await run();
  } finally {
    realtime.publish = original;
  }
  return seen;
}

describe("« À trier » dit ce qui reste", () => {
  it("tri et retrait : le compteur baisse, « Tout est trié » à zéro, la pastille tombe", async () => {
    const e = await createEvent(structureId, { title: "Nocturne de Canet", capacity: 20 });
    const candidates: TestUser[] = [];
    const apps: Awaited<ReturnType<typeof applyAs>>[] = [];
    for (let i = 0; i < 4; i++) {
      const u = await signUp(`Cand_${i}`);
      candidates.push(u);
      apps.push(await applyAs(u, e.id));
    }
    await notificationsService.deliverDue();
    expect(await triageTitle(damien)).toBe("4 candidatures à trier · Nocturne de Canet");
    const viewer = await viewerOf(damien);
    const decide = (i: number, decision: "accept" | "refuse") =>
      applicationsService.decide(
        viewer,
        e.id,
        apps[i]?.id as string,
        {
          decision,
          sendReasons: false,
          reasons: decision === "refuse" ? ["other"] : undefined,
        } as never,
      );
    await decide(0, "accept");
    await decide(1, "refuse");
    expect(await triageTitle(damien)).toBe("2 candidatures à trier · Nocturne de Canet");
    // Un candidat en attente qui se retire n'est plus à trier.
    await applicationsService.withdraw(await viewerOf(candidates[2] as TestUser), apps[2]?.id as string);
    expect(await triageTitle(damien)).toBe("1 candidature à trier · Nocturne de Canet");
    expect(await unseen(damien)).toBe(1);
    await decide(3, "accept");
    expect(await triageTitle(damien)).toBe("Tout est trié · Nocturne de Canet");
    expect(await unseen(damien)).toBe(0);
  });

  it("une ligne lue puis une nouvelle arrivée ne s'additionnent pas", async () => {
    const e = await createEvent(structureId, { title: "Nocturne de Canet", capacity: 20 });
    await applyAs(await signUp("Cand_a"), e.id);
    await notificationsService.deliverDue();
    const [line] = await mineIn(damien);
    await call(damien, "POST", "/me/notifications/read", { ids: [line?.id] });
    await applyAs(await signUp("Cand_b"), e.id);
    await notificationsService.deliverDue();
    expect(await mineIn(damien)).toHaveLength(2);
    expect(await triageTitle(damien)).toBe("2 candidatures à trier · Nocturne de Canet");
  });

  it("jamais au candidat : un responsable qui inscrit sa voiture ne reçoit rien, l'autre responsable si", async () => {
    const e = await createEvent(structureId, { title: "Nocturne de Canet", capacity: 20 });
    await applyAs(damien, e.id);
    expect((await mineIn(damien)).filter((r) => r.type === "application_received")).toHaveLength(0);
    expect((await mineIn(lea)).filter((r) => r.type === "application_received")).toHaveLength(1);
  });
});

describe("livraison et signaux", () => {
  it("un responsable retiré entre l'émission (heures calmes) et la livraison ne reçoit rien ; la ligne reste, invisible", async () => {
    const clock = useClock(fromWallTime({ year: 2026, month: 11, day: 12, hour: 23, minute: 0 }));
    quietHours(true);
    await withTx((tx, after) =>
      notifyStructure(tx, structureId, "staff_request", { title: "Demande", body: "B", after }),
    );
    await db
      .update(structureMembers)
      .set({ status: "removed" })
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.userId, lea.id)));
    clock.set(fromWallTime({ year: 2026, month: 11, day: 13, hour: 8, minute: 30 }));
    const sent = await signals("notification", () => notificationsService.deliverDue());
    expect(sent).toEqual([`user:${damien.id}`]);
    expect(await mineIn(lea)).toHaveLength(1);
    expect((await call(lea, "GET", `/structures/${structureId}/activity`)).status).toBe(403);
  });

  it("un seul inbox.changed par responsable quand une occurrence rejoint une ligne déjà livrée", async () => {
    const emit = () =>
      withTx((tx, after) =>
        notifyStructure(tx, structureId, "application_received", {
          title: "x",
          body: "x",
          groupKey: "applications:e:vehicle",
          after,
        }),
      );
    await emit();
    await notificationsService.deliverDue();
    const seen = await signals("inbox.changed", emit);
    expect(seen.sort()).toEqual([`user:${damien.id}`, `user:${lea.id}`].sort());
  });

  it("une demande de staff traitée prévient tous les responsables ; pastille et liste donnent le même nombre", async () => {
    const marc = await signUp("Marc_66");
    const banned = await signUp("Banni_66");
    await staffRequestsService.request(await viewerOf(marc), structureId, null);
    await db.insert(structureMembers).values({ structureId, userId: banned.id, role: "staff", status: "requested" });
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, banned.id));
    const summary = (await call(damien, "GET", `/structures/${structureId}/inbox/summary`)).json;
    const list = (await call(damien, "GET", `/structures/${structureId}/requests`)).json;
    expect(summary.staffRequests).toBe(1);
    expect(list.items).toHaveLength(1);
    const seen = await signals("inbox.changed", async () => {
      const res = await call(damien, "POST", `/structures/${structureId}/members/${marc.id}/accept`, {});
      expect(res.status).toBe(204);
    });
    expect(seen).toEqual(expect.arrayContaining([`user:${damien.id}`, `user:${lea.id}`]));
  });
});

describe("collaborations", () => {
  it("une invitation adressée à la structure ne compte que dans sa cloche, et sort du compteur si elle devient illisible", async () => {
    const kenji = await signUp("Kenji_66");
    const post = await dbPost(kenji, {});
    await db.insert(feedPostCoauthors).values({
      postId: post,
      coauthorKind: "structure",
      coauthorId: structureId,
      invitedBy: kenji.id,
    });
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingCoauthors).toBe(0);
    expect((await call(damien, "GET", `/structures/${structureId}/inbox/summary`)).json.coauthorRequests).toBe(1);
    expect((await call(damien, "GET", `/structures/${structureId}/requests`)).json.items).toHaveLength(1);
    // L'auteur passe en compte privé (non suivi) : la liste ne la montre plus, le compteur non plus.
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    expect((await call(damien, "GET", `/structures/${structureId}/requests`)).json.items).toHaveLength(0);
    expect((await call(damien, "GET", `/structures/${structureId}/inbox/summary`)).json.coauthorRequests).toBe(0);
    expect((await call(damien, "GET", `/structures/${structureId}/activity/count`)).json.requests.coauthor).toBe(0);
  });
});
