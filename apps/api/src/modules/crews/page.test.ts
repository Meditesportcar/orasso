// Page du crew (lot R5c2) : vitrine d'un non-membre (liste blanche, rien de plus), membre, ancien membre, chef ; droits
// des sorties avec le réglage oui et non ; date passée refusée ; réponses ; annulation ; notifications ; bannière sans
// décision de plaque cachée aux non-membres ; Instagram ; garage (plaques) ; « Où va le crew » ; anonymisation.
import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blurPlatesOf,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  suspendByModeration,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { applications, crewMembers, crewOutings, crews, notifications, profiles } from "../../db/schema";
import { rateRecord } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { retryRemove } from "../vehicles/photos-blur";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  ref = await seedReference();
});

async function req(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function banner(u: TestUser, crewId: string, decision: { noPlate?: boolean; rects?: boolean } = {}) {
  const data = await sharp({ create: { width: 900, height: 500, channels: 3, background: { r: 90, g: 40, b: 30 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("banner", new File([new Uint8Array(data)], "banniere.jpg", { type: "image/jpeg" }));
  if (decision.noPlate) form.append("noPlate", "true");
  if (decision.rects) form.append("plateRects", JSON.stringify([{ x: 0.4, y: 0.6, w: 0.2, h: 0.08 }]));
  const res = await app.request(`/api/crews/${crewId}/banner`, {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as { bannerUrl: string | null; bannerHiddenOutside: boolean | null },
  };
}

let n = 0;
async function newCrew(leader: TestUser) {
  const res = await req(leader, "POST", "/crews", { name: `Crew page ${++n}`, department: "66" });
  expect(res.status).toBe(201);
  return res.json as { id: string; slug: string };
}

async function addToCrew(crewId: string, leader: TestUser, member: TestUser) {
  expect((await req(member, "POST", `/crews/${crewId}/requests`, { message: null })).status).toBe(201);
  expect((await req(leader, "POST", `/crews/${crewId}/requests/${member.id}/accept`)).status).toBe(204);
}

/** Lot R6b : chacun suit l'autre par le vrai chemin (vers un compte privé, demande puis acceptation). */
async function befriend(a: TestUser, b: TestUser) {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const r = await req(from, "POST", `/users/${to.pseudo}/follow`);
    if (r.json.mine === "pending") {
      expect((await req(to, "POST", `/me/follow-requests/${from.id}/accept`)).status).toBe(200);
    } else expect(r.json).toEqual({ mine: "accepted" });
  }
}

const outing = (over: Record<string, unknown> = {}) => ({
  title: "Balade des Aspres",
  startsAt: paris(11, 1, 9).toISOString(),
  place: "Parking de la cave coopérative, Thuir",
  lat: 42.632,
  lng: 2.756,
  program: "Café, puis Castelnou et Prades.",
  ...over,
});

const VIEW_KEYS = [
  "archived",
  "bannerHiddenOutside",
  "bannerUrl",
  "conversationId",
  "createdAt",
  "department",
  "description",
  "id",
  "instagram",
  "leader",
  "logoUrl",
  "members",
  "membersCount",
  "name",
  "pendingInvitations",
  "pendingRequests",
  "slug",
  "space",
  "viewerState",
];

describe("vitrine et page du crew (lot R5c2)", () => {
  it("un non-membre voit la vitrine seule : membres en liste blanche, amis signalés, ni garage ni sorties ni discussion", async () => {
    const kenji = await signUp("Kenji_r5");
    const lea = await signUp("Lea_r5");
    const sarah = await signUp("Sarah_r5");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await befriend(sarah, lea);
    await createVehicle(lea.id, ref);
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(201);
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { instagram: "@roussillondrift" })).status).toBe(200);

    const v = await req(sarah, "GET", `/crews/by-slug/${crew.slug}`);
    expect(v.status).toBe(200);
    expect(Object.keys(v.json).sort()).toEqual(VIEW_KEYS);
    expect(v.json.viewerState).toBe("none");
    expect(v.json.space).toBeNull();
    expect(v.json.conversationId).toBeNull();
    expect(v.json.pendingRequests).toBeNull();
    expect(v.json.bannerHiddenOutside).toBeNull();
    expect(v.json.instagram).toBe("roussillondrift");
    expect(v.json.membersCount).toBe(2);
    expect(v.json.members).toHaveLength(2);
    for (const m of v.json.members) {
      expect(Object.keys(m).sort()).toEqual(["avatarUrl", "friend", "grade", "pseudo", "role"]);
    }
    expect(v.json.members[0]).toMatchObject({ pseudo: kenji.pseudo, role: "leader", friend: false });
    expect(v.json.members[1]).toMatchObject({ pseudo: lea.pseudo, role: "member", friend: true });
    // Rien des sorties ni des identifiants de compte dans la réponse.
    const text = JSON.stringify(v.json);
    expect(text).not.toContain("Balade des Aspres");
    expect(text).not.toContain(lea.id);
    // Les routes de l'espace du crew restent fermées.
    expect((await req(sarah, "GET", `/crews/${crew.id}/members`)).status).toBe(403);
    expect((await req(sarah, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(403);
  });

  it("un membre voit l'espace du crew : sorties, garage aux plaques masquées, non-lus, membres avec véhicule", async () => {
    const kenji = await signUp("Kenji_r5b");
    const lea = await signUp("Lea_r5b");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const hidden = await createVehicle(lea.id, ref);
    const shown = await createVehicle(kenji.id, ref);
    await blurPlatesOf(kenji.id);
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(201);

    const v = await req(lea, "GET", `/crews/by-slug/${crew.slug}`);
    expect(v.json.viewerState).toBe("member");
    expect(v.json.conversationId).toBeTruthy();
    expect(v.json.pendingRequests).toBeNull();
    expect(Object.keys(v.json.space).sort()).toEqual([
      "canProposeOuting",
      "events",
      "garage",
      "membersCanProposeOutings",
      "outings",
      "unreadCount",
    ]);
    expect(v.json.space.outings).toHaveLength(1);
    expect(v.json.space.outings[0]).toMatchObject({
      title: "Balade des Aspres",
      authorPseudo: kenji.pseudo,
      yes: 0,
      mine: null,
      canManage: false,
    });
    const garage = v.json.space.garage as { id: string; photoUrl: string | null; ownerPseudo: string }[];
    expect(garage.map((g) => g.id).sort()).toEqual([hidden.id, shown.id].sort());
    // Invariant « Plaques et photos » : sans décision de plaque, pas de photo hors du garage de son propriétaire.
    expect(garage.find((g) => g.id === hidden.id)?.photoUrl).toBeNull();
    expect(garage.find((g) => g.id === shown.id)?.photoUrl).toBeTruthy();
    expect(JSON.stringify(garage)).not.toContain("AA-");

    const members = await req(lea, "GET", `/crews/${crew.id}/members`);
    expect(members.status).toBe(200);
    expect(members.json.map((m: { vehicleLabel: string | null }) => Boolean(m.vehicleLabel))).toEqual([true, true]);
  });

  it("tour 2 : la vitrine d'un non-membre est limitée en débit (429 « Trop de… »), pas l'espace d'un membre", async () => {
    const kenji = await signUp("Kenji_rl");
    const sarah = await signUp("Sarah_rl");
    const crew = await newCrew(kenji);
    for (let i = 0; i < 120; i++) {
      rateRecord("crewVitrine", sarah.id);
      rateRecord("crewVitrine", kenji.id);
    }
    const limited = await req(sarah, "GET", `/crews/by-slug/${crew.slug}`);
    expect(limited.status).toBe(429);
    expect(JSON.stringify(limited.json)).toContain("Trop de");
    expect((await req(sarah, "GET", `/crews/${crew.id}`)).status).toBe(429);
    expect((await req(kenji, "GET", `/crews/by-slug/${crew.slug}`)).status).toBe(200);
  });

  it("un ancien membre ne voit plus que la vitrine ; un compte suspendu disparaît des membres et du nombre", async () => {
    const kenji = await signUp("Kenji_r5c");
    const lea = await signUp("Lea_r5c");
    const nina = await signUp("Nina_r5c");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await addToCrew(crew.id, kenji, nina);
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    const v = await req(lea, "GET", `/crews/by-slug/${crew.slug}`);
    expect(v.json.viewerState).toBe("none");
    expect(v.json.space).toBeNull();
    expect(v.json.conversationId).toBeNull();
    expect((await req(lea, "GET", `/crews/${crew.id}/members`)).status).toBe(403);

    await suspendByModeration(nina);
    const after = await req(kenji, "GET", `/crews/by-slug/${crew.slug}`);
    expect(after.json.members.map((m: { pseudo: string }) => m.pseudo)).toEqual([kenji.pseudo]);
    expect(after.json.membersCount).toBe(1);
    const list = await req(kenji, "GET", `/crews/${crew.id}/members`);
    expect(list.json.map((m: { pseudo: string }) => m.pseudo)).toEqual([kenji.pseudo]);
  });

  it("le chef règle Instagram et le droit de proposer une sortie ; Instagram refuse ce qui n'est pas un compte", async () => {
    const kenji = await signUp("Kenji_r5d");
    const lea = await signUp("Lea_r5d");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const set = await req(kenji, "PATCH", `/crews/${crew.id}`, {
      instagram: "https://www.instagram.com/roussillon.drift/",
      membersCanProposeOutings: false,
    });
    expect(set.status).toBe(200);
    expect(set.json.instagram).toBe("roussillon.drift");
    expect(set.json.space.membersCanProposeOutings).toBe(false);
    expect(set.json.space.canProposeOuting).toBe(true);
    for (const bad of ["https://www.instagram.com/p/C0ffee/", "https://evil.example/roussillon", "rouss illon!"]) {
      expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { instagram: bad })).status).toBe(400);
    }
    expect((await req(lea, "PATCH", `/crews/${crew.id}`, { membersCanProposeOutings: true })).status).toBe(403);
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { instagram: "" })).json.instagram).toBeNull();
    const leaView = await req(lea, "GET", `/crews/by-slug/${crew.slug}`);
    expect(leaView.json.space.canProposeOuting).toBe(false);
  });

  it("un réglage seul ne touche pas au reste : la description reste ; vide, elle est retirée", async () => {
    const kenji = await signUp("Kenji_r5e");
    const crew = await newCrew(kenji);
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { description: "Japonaises et glisse." })).status).toBe(200);
    const right = await req(kenji, "PATCH", `/crews/${crew.id}`, { membersCanProposeOutings: false });
    expect(right.json.description).toBe("Japonaises et glisse.");
    const insta = await req(kenji, "PATCH", `/crews/${crew.id}`, { instagram: "roussillondrift" });
    expect(insta.json.description).toBe("Japonaises et glisse.");
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { description: "" })).json.description).toBeNull();
  });
});

describe("sorties du crew (lot R5c2)", () => {
  it("réglage oui : un membre propose ; réglage non : seul le chef ; date passée ou trop lointaine refusée", async () => {
    const kenji = await signUp("Kenji_o1");
    const lea = await signUp("Lea_o1");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    // Oui par défaut.
    const byLea = await req(lea, "POST", `/crews/${crew.id}/outings`, outing({ title: "Balade de Léa" }));
    expect(byLea.status).toBe(201);
    expect(byLea.json.canManage).toBe(true);
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { membersCanProposeOutings: false })).status).toBe(200);
    expect((await req(lea, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(403);
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(201);
    // Dates : passée (même d'une minute), maintenant, trop lointaine.
    const past = await req(kenji, "POST", `/crews/${crew.id}/outings`, {
      ...outing(),
      startsAt: new Date(clock.now.getTime() - 60_000).toISOString(),
    });
    expect(past.status).toBe(400);
    expect(
      (await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ startsAt: clock.now.toISOString() }))).status,
    ).toBe(400);
    expect(
      (await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ startsAt: paris(12, 31, 9).toISOString() })))
        .status,
    ).toBe(201);
    const tooFar = new Date(clock.now.getTime() + 400 * 24 * HOUR).toISOString();
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ startsAt: tooFar }))).status).toBe(400);
    // Lieu obligatoire, point complet.
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ place: "" }))).status).toBe(400);
    expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ lng: null }))).status).toBe(400);
    expect(
      (await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ lat: null, lng: null, title: "Sans point" })))
        .status,
    ).toBe(201);
  });

  it("modifier et annuler : l'auteur ou le chef ; les autres membres non ; réponses ; ceux qui viennent sont prévenus", async () => {
    const kenji = await signUp("Kenji_o2");
    const lea = await signUp("Lea_o2");
    const nina = await signUp("Nina_o2");
    const theo = await signUp("Theo_o2");
    const crew = await newCrew(kenji);
    for (const m of [lea, nina, theo]) await addToCrew(crew.id, kenji, m);
    const created = await req(lea, "POST", `/crews/${crew.id}/outings`, outing());
    expect(created.status).toBe(201);
    const id = created.json.id as string;
    // Nouvelle sortie : tous les membres sauf l'auteur sont prévenus.
    const fresh = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.type, "crew_outing_new"));
    expect(fresh.map((r) => r.userId).sort()).toEqual([kenji.id, nina.id, theo.id].sort());

    expect((await req(nina, "PATCH", `/crews/${crew.id}/outings/${id}`, { title: "Pas à moi" })).status).toBe(403);
    const edited = await req(lea, "PATCH", `/crews/${crew.id}/outings/${id}`, { title: "Balade des Aspres 2" });
    expect(edited.status).toBe(200);
    expect(edited.json.title).toBe("Balade des Aspres 2");
    const moved = await req(kenji, "PATCH", `/crews/${crew.id}/outings/${id}`, {
      startsAt: paris(11, 8, 9).toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(
      (await req(kenji, "PATCH", `/crews/${crew.id}/outings/${id}`, { startsAt: paris(9, 1, 9).toISOString() })).status,
    ).toBe(400);

    // Réponses : la dernière compte, les compteurs suivent.
    expect((await req(nina, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "maybe" })).json.maybe).toBe(1);
    const yes = await req(nina, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "yes" });
    expect(yes.json).toMatchObject({ yes: 1, maybe: 0, mine: "yes" });
    expect(yes.json.going).toEqual([{ pseudo: nina.pseudo, avatarUrl: null }]);
    expect((await req(theo, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "no" })).json.yes).toBe(1);
    expect((await req(theo, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "plutôt" })).status).toBe(400);

    expect((await req(nina, "DELETE", `/crews/${crew.id}/outings/${id}`)).status).toBe(403);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/outings/${id}`)).status).toBe(204);
    const cancelled = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.type, "crew_outing_cancelled"));
    // Seule Nina venait (Théo a dit non, Léa n'a pas répondu ; Kenji annule).
    expect(cancelled.map((r) => r.userId)).toEqual([nina.id]);
    const v = await req(lea, "GET", `/crews/by-slug/${crew.slug}`);
    expect(v.json.space.outings).toEqual([]);
    expect((await req(nina, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "yes" })).status).toBe(409);
  });

  it("le fil du crew montre la sortie proposée (« Je viens », compteurs) ; passée, sans réponse ; annulée, elle part", async () => {
    const kenji = await signUp("Kenji_of");
    const lea = await signUp("Lea_of");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const created = await req(kenji, "POST", `/crews/${crew.id}/outings`, outing());
    const id = created.json.id as string;
    expect((await req(lea, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "yes" })).status).toBe(200);
    const itemOf = async (u: TestUser) =>
      (
        (await req(u, "GET", `/crews/${crew.id}/feed`)).json.items as { type: string; key: string; outing?: unknown }[]
      ).find((x) => x.type === "crew_outing");
    const item = await itemOf(lea);
    expect(item).toMatchObject({
      key: `crew_outing:${id}`,
      outing: { id, title: "Balade des Aspres", authorPseudo: kenji.pseudo, yes: 1, maybe: 0, mine: "yes", open: true },
    });
    expect(Object.keys(item?.outing as object).sort()).toEqual(
      ["authorPseudo", "id", "maybe", "mine", "open", "place", "startsAt", "title", "yes"].sort(),
    );
    expect(await itemOf(kenji)).toMatchObject({ outing: { mine: null, yes: 1 } });
    // Un non-membre n'a pas de fil.
    const outsider = await signUp("Out_of");
    expect((await req(outsider, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
    // Passée : elle reste dans le fil, sans « Je viens ».
    clock.set(paris(11, 2, 9));
    expect(await itemOf(lea)).toMatchObject({ outing: { open: false } });
    // Annulée : elle quitte le fil.
    clock.set(paris(10, 1, 11));
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/outings/${id}`)).status).toBe(204);
    expect(await itemOf(lea)).toBeUndefined();
  });

  describe("notifications de sortie revérifiées à la livraison (tour 2)", () => {
    /** Simule les heures calmes : les notifications de ce type attendent 8 h le lendemain. */
    async function deferToMorning(type: string) {
      await notificationsService.flush();
      await db
        .update(notifications)
        .set({ deliveredAt: null, deliverAfter: paris(10, 2, 8) })
        .where(eq(notifications.type, type));
    }
    const rowsOf = (type: string) =>
      db
        .select({ userId: notifications.userId, deliveredAt: notifications.deliveredAt })
        .from(notifications)
        .where(eq(notifications.type, type));

    it("sortie créée la nuit, puis départ et retrait : rien à 8 h pour ceux qui sont partis, les autres la reçoivent", async () => {
      clock.set(paris(10, 1, 23));
      const kenji = await signUp("Kenji_n1");
      const lea = await signUp("Lea_n1");
      const nina = await signUp("Nina_n1");
      const theo = await signUp("Theo_n1");
      const crew = await newCrew(kenji);
      for (const m of [lea, nina, theo]) await addToCrew(crew.id, kenji, m);
      expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(201);
      await deferToMorning("crew_outing_new");
      expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
      // Au départ, sa notification encore différée est retirée tout de suite.
      expect((await rowsOf("crew_outing_new")).map((r) => r.userId)).not.toContain(lea.id);
      // Une ligne qui aurait échappé au retrait : la livraison la revérifie (ici Théo, retiré après coup).
      expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${theo.id}`)).status).toBe(204);
      clock.set(paris(10, 2, 8, 1));
      await notificationsService.deliverDue();
      const rows = await rowsOf("crew_outing_new");
      expect(rows.map((r) => r.userId)).toEqual([nina.id]);
      expect(rows[0]?.deliveredAt).not.toBeNull();
    });

    it("garde de livraison : membre parti ou crew dissous, la notification est supprimée sans être envoyée", async () => {
      clock.set(paris(10, 1, 23));
      const kenji = await signUp("Kenji_n2");
      const lea = await signUp("Lea_n2");
      const crew = await newCrew(kenji);
      await addToCrew(crew.id, kenji, lea);
      expect((await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).status).toBe(201);
      await deferToMorning("crew_outing_new");
      // Départ écrit sans passer par le service (la ligne reste) : la garde de livraison la supprime.
      await db
        .update(crewMembers)
        .set({ status: "left" })
        .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, lea.id)));
      clock.set(paris(10, 2, 8, 1));
      await notificationsService.deliverDue();
      expect(await rowsOf("crew_outing_new")).toEqual([]);
      // Dissolution : les notifications du crew encore différées partent avec lui.
      const kenji2 = await signUp("Kenji_n3");
      const nina = await signUp("Nina_n3");
      const crew2 = await newCrew(kenji2);
      await addToCrew(crew2.id, kenji2, nina);
      clock.set(paris(10, 2, 23));
      expect((await req(kenji2, "POST", `/crews/${crew2.id}/outings`, outing())).status).toBe(201);
      await notificationsService.flush();
      await db
        .update(notifications)
        .set({ deliveredAt: null, deliverAfter: paris(10, 3, 8) })
        .where(eq(notifications.type, "crew_outing_new"));
      expect((await req(kenji2, "DELETE", `/crews/${crew2.id}`)).status).toBe(204);
      expect(await rowsOf("crew_outing_new")).toEqual([]);
    });

    it("annulée avant 8 h : jamais « nouvelle » puis « annulée » ; une seule notification pour qui venait, rien sinon", async () => {
      clock.set(paris(10, 1, 23));
      const kenji = await signUp("Kenji_n4");
      const nina = await signUp("Nina_n4");
      const theo = await signUp("Theo_n4");
      const crew = await newCrew(kenji);
      for (const m of [nina, theo]) await addToCrew(crew.id, kenji, m);
      const id = (await req(kenji, "POST", `/crews/${crew.id}/outings`, outing())).json.id as string;
      await deferToMorning("crew_outing_new");
      expect((await req(nina, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "yes" })).status).toBe(200);
      clock.set(paris(10, 2, 1));
      expect((await req(kenji, "DELETE", `/crews/${crew.id}/outings/${id}`)).status).toBe(204);
      await deferToMorning("crew_outing_cancelled");
      clock.set(paris(10, 2, 8, 1));
      await notificationsService.deliverDue();
      expect(await rowsOf("crew_outing_new")).toEqual([]);
      const cancelled = await rowsOf("crew_outing_cancelled");
      expect(cancelled.map((r) => r.userId)).toEqual([nina.id]);
      expect(cancelled[0]?.deliveredAt).not.toBeNull();
    });
  });

  it("une sortie passée ne se modifie plus ; un membre parti ne compte plus ; un compte suspendu n'est pas prévenu", async () => {
    const kenji = await signUp("Kenji_o3");
    const lea = await signUp("Lea_o3");
    const nina = await signUp("Nina_o3");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await addToCrew(crew.id, kenji, nina);
    await suspendByModeration(nina);
    const created = await req(
      kenji,
      "POST",
      `/crews/${crew.id}/outings`,
      outing({ startsAt: paris(10, 2, 9).toISOString() }),
    );
    const id = created.json.id as string;
    const notified = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.type, "crew_outing_new"));
    expect(notified.map((r) => r.userId)).toEqual([lea.id]);
    expect((await req(lea, "PUT", `/crews/${crew.id}/outings/${id}/rsvp`, { answer: "yes" })).json.yes).toBe(1);
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    const view = await req(kenji, "GET", `/crews/by-slug/${crew.slug}`);
    expect(view.json.space.outings[0].yes).toBe(0);
    clock.set(paris(10, 2, 10));
    expect((await req(kenji, "PATCH", `/crews/${crew.id}/outings/${id}`, { title: "Trop tard" })).status).toBe(409);
    // Encore visible le jour même (12 h après le rendez-vous), plus le lendemain. Tour 2 : capacités effectives, ni
    // modification ni réponse une fois commencée.
    const started = (await req(kenji, "GET", `/crews/by-slug/${crew.slug}`)).json.space.outings;
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ canManage: false, open: false });
    clock.set(paris(10, 3, 9));
    expect((await req(kenji, "GET", `/crews/by-slug/${crew.slug}`)).json.space.outings).toHaveLength(0);
  });

  it("compte supprimé : ses sorties et ses réponses disparaissent", async () => {
    const kenji = await signUp("Kenji_o4");
    const lea = await signUp("Lea_o4");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const mine = await req(lea, "POST", `/crews/${crew.id}/outings`, outing());
    const his = await req(kenji, "POST", `/crews/${crew.id}/outings`, outing({ title: "Sortie du chef" }));
    expect((await req(lea, "PUT", `/crews/${crew.id}/outings/${his.json.id}/rsvp`, { answer: "yes" })).status).toBe(
      200,
    );
    await accountService.anonymize(lea.id, null);
    expect(await db.select().from(crewOutings).where(eq(crewOutings.id, mine.json.id))).toEqual([]);
    const view = await req(kenji, "GET", `/crews/by-slug/${crew.slug}`);
    expect(view.json.space.outings.map((o: { title: string; yes: number }) => [o.title, o.yes])).toEqual([
      ["Sortie du chef", 0],
    ]);
  });
});

describe("bannière et « Où va le crew » (lot R5c2)", () => {
  it("bannière sans décision de plaque : vue des membres, cachée aux non-membres ; avec décision : vue de tous", async () => {
    const kenji = await signUp("Kenji_b1");
    const lea = await signUp("Lea_b1");
    const sarah = await signUp("Sarah_b1");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    expect((await banner(lea, crew.id, { noPlate: true })).status).toBe(403);
    const raw = await banner(kenji, crew.id);
    expect(raw.status).toBe(200);
    expect(raw.json.bannerUrl).toBeTruthy();
    expect(raw.json.bannerHiddenOutside).toBe(true);
    expect((await req(lea, "GET", `/crews/by-slug/${crew.slug}`)).json.bannerUrl).toBeTruthy();
    expect((await req(sarah, "GET", `/crews/by-slug/${crew.slug}`)).json.bannerUrl).toBeNull();

    const blurred = await banner(kenji, crew.id, { rects: true });
    expect(blurred.json.bannerHiddenOutside).toBe(false);
    expect((await req(sarah, "GET", `/crews/by-slug/${crew.slug}`)).json.bannerUrl).toBe(blurred.json.bannerUrl);
    const none = await banner(kenji, crew.id, { noPlate: true });
    expect((await req(sarah, "GET", `/crews/by-slug/${crew.slug}`)).json.bannerUrl).toBe(none.json.bannerUrl);
    const removed = await req(kenji, "DELETE", `/crews/${crew.id}/banner`);
    expect(removed.status).toBe(200);
    expect(removed.json.bannerUrl).toBeNull();
  });

  it("tour 2 : bannière dans l'espace privé, lue par une route qui revérifie à chaque lecture ; en-têtes de cache", async () => {
    const kenji = await signUp("Kenji_b2");
    const lea = await signUp("Lea_b2");
    const sarah = await signUp("Sarah_b2");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const get = async (u: TestUser | null, url: string) => {
      const res = await app.request(url, { headers: { origin: ORIGIN, ...(u ? { cookie: u.cookie } : {}) } });
      return { status: res.status, cache: res.headers.get("cache-control") };
    };
    const raw = await banner(kenji, crew.id);
    const url = raw.json.bannerUrl as string;
    expect(url).toMatch(new RegExp(`^/api/crews/${crew.id}/banner/[0-9a-f]{16}\\.webp$`));
    const [row] = await db.select({ key: crews.bannerKey }).from(crews).where(eq(crews.id, crew.id));
    expect(row?.key).toMatch(new RegExp(`^private/crew-banners/${crew.id}/[0-9a-f]{16}\\.webp$`));
    // Jamais servie par l'adresse publique des fichiers.
    expect((await get(kenji, `/api/files/${row?.key}`)).status).toBe(404);
    // Sans décision de plaque : les membres, sans cache ; ni un non-membre, ni un visiteur sans compte.
    expect(await get(lea, url)).toEqual({ status: 200, cache: "private, no-store" });
    expect((await get(sarah, url)).status).toBe(404);
    expect((await get(null, url)).status).toBe(401);
    // Un ancien membre perd l'accès tout de suite.
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    expect((await get(lea, url)).status).toBe(404);
    // Avec décision : tout compte connecté (vitrine), une heure dans le cache privé.
    const cleared = await banner(kenji, crew.id, { noPlate: true });
    expect(await get(sarah, cleared.json.bannerUrl as string)).toEqual({ status: 200, cache: "private, max-age=3600" });
    // L'ancienne adresse ne sert plus rien.
    expect((await get(kenji, url)).status).toBe(404);
  });

  it("tour 2 : l'ancienne bannière est retirée du stockage (remplacée, retirée, crew dissous) ; une panne est reprise", async () => {
    const kenji = await signUp("Kenji_b3");
    const crew = await newCrew(kenji);
    const keyOf = async () =>
      (await db.select({ key: crews.bannerKey }).from(crews).where(eq(crews.id, crew.id)))[0]?.key ?? null;
    await banner(kenji, crew.id, { noPlate: true });
    const first = (await keyOf()) as string;
    expect(await storage.get(first)).not.toBeNull();
    await banner(kenji, crew.id, { noPlate: true });
    const second = (await keyOf()) as string;
    expect(await storage.get(first)).toBeNull();
    // Le stockage tombe au retrait : la tâche `storage.remove` reprend la suppression.
    const spy = vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("stockage indisponible"));
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/banner`)).status).toBe(200);
    spy.mockRestore();
    expect(await storage.get(second)).not.toBeNull();
    const job = clock.jobs.jobs.find((j) => j.name === "storage.remove" && j.data.key === second);
    expect(job).toBeTruthy();
    await retryRemove(second);
    expect(await storage.get(second)).toBeNull();
    // Dissolution : la bannière part avec le crew.
    await banner(kenji, crew.id, { noPlate: true });
    const third = (await keyOf()) as string;
    expect((await req(kenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
    expect(await storage.get(third)).toBeNull();
  });

  it("tour 2 : membre au compte privé vu par un membre non ami : marque et modèle, sans photo ; ses sorties seules restent privées", async () => {
    const kenji = await signUp("Kenji_p1");
    const lea = await signUp("Lea_p1");
    const nina = await signUp("Nina_p1");
    const owner = await signUp("Orga_p1");
    const crew = await newCrew(kenji);
    for (const m of [lea, nina]) await addToCrew(crew.id, kenji, m);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, lea.id));
    const car = await createVehicle(lea.id, ref);
    await blurPlatesOf(lea.id);
    const structure = await createStructure(owner.id);
    const solo = await createEvent(structure.id, { startsAt: paris(10, 20, 9), title: "Cars & Coffee" });
    const withCrew = await createEvent(structure.id, { startsAt: paris(10, 21, 9), title: "Nuit des Moteurs" });
    for (const [e, crewId] of [
      [solo, null],
      [withCrew, crew.id],
    ] as const) {
      await db.insert(applications).values({
        eventId: e.id,
        userId: lea.id,
        vehicleId: car.id,
        status: "accepted",
        crewId,
        rulesAcceptedAt: new Date(),
        followStructure: true,
      });
    }
    const seen = async (u: TestUser) => {
      const v = await req(u, "GET", `/crews/by-slug/${crew.slug}`);
      const members = await req(u, "GET", `/crews/${crew.id}/members`);
      return {
        garage: (v.json.space.garage as { id: string; label: string; photoUrl: string | null }[]).find(
          (g) => g.id === car.id,
        ),
        events: (v.json.space.events as { title: string }[]).map((e) => e.title),
        label: (members.json as { pseudo: string; vehicleLabel: string | null }[]).find((m) => m.pseudo === lea.pseudo)
          ?.vehicleLabel,
      };
    };
    // Nina, membre non amie : ni photo ni génération ; sa participation seule n'apparaît pas, celle avec le crew oui.
    const byNina = await seen(nina);
    expect(byNina.garage?.photoUrl).toBeNull();
    expect(byNina.events).toEqual(["Nuit des Moteurs"]);
    // Kenji, ami de Léa : tout.
    await befriend(kenji, lea);
    const byKenji = await seen(kenji);
    expect(byKenji.garage?.photoUrl).toBeTruthy();
    expect(byKenji.events).toEqual(["Cars & Coffee", "Nuit des Moteurs"]);
    expect(byNina.garage?.label.length).toBeLessThanOrEqual(byKenji.garage?.label.length ?? 0);
    expect(byNina.label).toBe(byNina.garage?.label);
    // Léa elle-même : tout.
    expect((await seen(lea)).garage?.photoUrl).toBeTruthy();
  });

  it("« Où va le crew » : membres retenus et inscriptions du crew ; jamais une invitation privée d'un membre", async () => {
    const kenji = await signUp("Kenji_e1");
    const lea = await signUp("Lea_e1");
    const owner = await signUp("Orga_e1");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const structure = await createStructure(owner.id);
    const open = await createEvent(structure.id, { startsAt: paris(10, 20, 9), title: "Cars & Coffee" });
    const secret = await createEvent(structure.id, {
      startsAt: paris(10, 22, 9),
      title: "Soirée privée",
      admission: "invite_only",
    });
    const past = await createEvent(structure.id, { startsAt: paris(9, 20, 9), title: "Passé" });
    const vehicle = await createVehicle(lea.id, ref);
    for (const e of [open, secret, past]) {
      await db.insert(applications).values({
        eventId: e.id,
        userId: lea.id,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: true,
      });
    }
    const v = await req(kenji, "GET", `/crews/by-slug/${crew.slug}`);
    expect(v.json.space.events.map((e: { title: string }) => e.title)).toEqual(["Cars & Coffee"]);
    expect(v.json.space.events[0]).toMatchObject({ registered: 0, going: [{ pseudo: lea.pseudo, avatarUrl: null }] });
    // Inscription du crew : visible, même pas encore triée.
    await db
      .update(applications)
      .set({ crewId: crew.id, status: "pending" })
      .where(and(eq(applications.eventId, secret.id), eq(applications.userId, lea.id)));
    const after = await req(kenji, "GET", `/crews/by-slug/${crew.slug}`);
    expect(after.json.space.events.map((e: { title: string; registered: number }) => [e.title, e.registered])).toEqual([
      ["Cars & Coffee", 0],
      ["Soirée privée", 1],
    ]);
    // Un non-membre n'en voit rien.
    const sarah = await signUp("Sarah_e1");
    expect((await req(sarah, "GET", `/crews/by-slug/${crew.slug}`)).json.space).toBeNull();
  });
});
