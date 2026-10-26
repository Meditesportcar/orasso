// Page du crew (lot R5c2) : vitrine d'un non-membre (liste blanche, rien de plus), membre, ancien membre, chef ; droits
// des sorties avec le réglage oui et non ; date passée refusée ; réponses ; annulation ; notifications ; bannière sans
// décision de plaque cachée aux non-membres ; Instagram ; garage (plaques) ; « Où va le crew » ; anonymisation.
import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

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
import { applications, crewOutings, notifications } from "../../db/schema";
import { accountService } from "../account/service";

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

async function befriend(a: TestUser, b: TestUser) {
  const r = await req(a, "POST", "/friends/requests", { pseudo: b.pseudo });
  expect(r.status).toBe(201);
  expect((await req(b, "POST", `/friends/requests/${r.json.id}/accept`)).status).toBe(200);
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
    // Encore visible le jour même (12 h après le rendez-vous), plus le lendemain.
    expect((await req(kenji, "GET", `/crews/by-slug/${crew.slug}`)).json.space.outings).toHaveLength(1);
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
