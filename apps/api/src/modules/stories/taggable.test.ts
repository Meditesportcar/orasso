// Lot R7f3 : @identification d'une story, `GET /users/search?taggableFor=…` : la liste ne propose que des personnes qui
// pourraient voir la story (compte privé : abonnés acceptés ; crew : membres actifs ; compte public : tout membre) ; l'API
// de publication refuse toujours le reste (`skipped`), la liste n'est qu'une aide.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEvent,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  mediaProfiles,
  notifications,
  profiles,
  providerProfiles,
  stories,
  storyTags,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function req(u: TestUser, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      cookie: u.cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function follow(a: TestUser, b: TestUser) {
  await req(a, "POST", `/users/${b.pseudo}/follow`);
  await db
    .update(userFollows)
    .set({ status: "accepted", acceptedAt: clock.now })
    .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
}
const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));
const pseudos = (res: { json: { items: { pseudo: string }[] } }) => res.json.items.map((i) => i.pseudo).sort();

describe("recherche d'une personne à identifier (taggableFor)", () => {
  it("compte privé : seulement mes abonnés acceptés (pas ceux que je suis, pas une demande en attente)", async () => {
    const me = await signUp("Moi");
    const fan = await signUp("Tag_Abonne");
    const pending = await signUp("Tag_Attente");
    const followed = await signUp("Tag_Suivi");
    const stranger = await signUp("Tag_Inconnu");
    await makePrivate(me);
    await follow(fan, me);
    await follow(me, followed);
    // Une demande d'abonnement en attente ne voit rien.
    await req(pending, "POST", `/users/${me.pseudo}/follow`);
    void stranger;

    const all = await req(me, "GET", "/users/search?q=Tag_");
    expect(pseudos(all)).toEqual(["Tag_Abonne", "Tag_Attente", "Tag_Inconnu", "Tag_Suivi"]);
    for (const audience of ["followers", "public"]) {
      const res = await req(me, "GET", `/users/search?q=Tag_&taggableFor=${audience}`);
      expect(res.status).toBe(200);
      expect(pseudos(res), audience).toEqual(["Tag_Abonne"]);
    }
    // La casquette organisateur ou pro publie en public : tout membre peut la voir.
    const org = await req(me, "GET", "/users/search?q=Tag_&taggableFor=public&persona=organizer");
    expect(pseudos(org)).toEqual(["Tag_Abonne", "Tag_Attente", "Tag_Inconnu", "Tag_Suivi"]);
  });

  it("compte public : tout membre en règle (pas de supprimé)", async () => {
    const me = await signUp("Moi");
    await signUp("Tag_Un");
    const gone = await signUp("Tag_Deux");
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, gone.id));
    const res = await req(me, "GET", "/users/search?q=Tag_&taggableFor=followers");
    expect(pseudos(res)).toEqual(["Tag_Un"]);
  });

  it("story de crew : seulement les membres actifs du crew, et rien si je n'en suis pas membre", async () => {
    const leader = await signUp("Chef");
    const member = await signUp("Tag_Membre");
    const outsider = await signUp("Tag_Dehors");
    const crew = (await req(leader, "POST", "/crews", { name: "Crew taggable", department: "66" })).json as {
      id: string;
    };
    expect((await req(member, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(leader, "POST", `/crews/${crew.id}/requests/${member.id}/accept`)).status).toBe(204);
    void outsider;
    // Le chef cherche : le membre oui, l'inconnu non.
    const ok = await req(leader, "GET", `/users/search?q=Tag_&taggableFor=crew&crewId=${crew.id}`);
    expect(pseudos(ok)).toEqual(["Tag_Membre"]);
    // Sans crew choisi, ou pour quelqu'un qui n'est pas du crew : rien.
    expect(pseudos(await req(leader, "GET", "/users/search?q=Tag_&taggableFor=crew"))).toEqual([]);
    expect(pseudos(await req(outsider, "GET", `/users/search?q=Tag&taggableFor=crew&crewId=${crew.id}`))).toEqual([]);
    // Le membre retiré n'est plus proposé.
    expect((await req(leader, "DELETE", `/crews/${crew.id}/members/${member.id}`)).status).toBeLessThan(300);
    expect(pseudos(await req(leader, "GET", `/users/search?q=Tag_&taggableFor=crew&crewId=${crew.id}`))).toEqual([]);
  });

  it("valeurs inconnues : 400", async () => {
    const me = await signUp("Moi");
    expect((await req(me, "GET", "/users/search?q=Tag_&taggableFor=tout")).status).toBe(400);
    expect((await req(me, "GET", "/users/search?q=Tag_&taggableFor=crew&crewId=pas-un-uuid")).status).toBe(400);
  });
});

/** Photo d'essai : un bruit coloré, sans aucun texte ni plaque. */
async function uploadKey(u: TestUser): Promise<string> {
  const raw = Buffer.alloc(800 * 450 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  const jpeg = await sharp(raw, { raw: { width: 800, height: 450, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  const form = new FormData();
  form.append("purpose", "story");
  form.append("file", new File([new Uint8Array(jpeg)], "photo.jpg", { type: "image/jpeg" }));
  const up = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return ((await up.json()) as { key: string }).key;
}
const send = (u: TestUser, key: string, over: Record<string, unknown> = {}) =>
  req(u, "POST", "/me/stories", { uploadKey: key, noPlateConfirmed: true, audience: "public", ...over });
async function publish(u: TestUser, over: Record<string, unknown>) {
  return send(u, await uploadKey(u), over);
}

describe("autocollant d'événement : l'organisateur est prévenu", () => {
  it("un compte public qui colle un événement identifie sa structure (une seule fois, même identifiée à la main)", async () => {
    const orga = await signUp("Orga");
    const kenji = await signUp("Kenji");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id);
    const res = await publish(kenji, {
      eventId: event.id,
      tags: [{ kind: "structure", id: structure.id }],
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.skipped).toEqual([]);
    expect(await db.select().from(storyTags)).toHaveLength(1);
    const mentions = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, orga.id), eq(notifications.type, "story_mention")));
    expect(mentions).toHaveLength(1);
  });

  it("compte privé : l'autocollant est écarté et l'organisateur n'est pas prévenu", async () => {
    const orga = await signUp("Orga");
    const priv = await signUp("Prive");
    await makePrivate(priv);
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id);
    const res = await publish(priv, { audience: "followers", eventId: event.id });
    expect(res.status).toBe(201);
    expect(res.json.skipped).toHaveLength(1);
    expect(await db.select().from(storyTags)).toHaveLength(0);
    const mentions = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, orga.id), eq(notifications.type, "story_mention")));
    expect(mentions).toHaveLength(0);
  });
});

describe("autocollant d'événement : seulement un événement ouvert au public (tour 2)", () => {
  it("un événement sur invitation ou annulé est écarté (comme un brouillon) ; l'organisateur n'est pas prévenu", async () => {
    const orga = await signUp("Orga");
    const kenji = await signUp("Kenji");
    const structure = await createStructure(orga.id);
    const closed = [
      await createEvent(structure.id, { admission: "invite_only" }),
      await createEvent(structure.id, { status: "cancelled" }),
      await createEvent(structure.id, { status: "draft" }),
    ];
    for (const e of closed) {
      const res = await publish(kenji, { eventId: e.id });
      expect(res.status, JSON.stringify(res.json)).toBe(201);
      expect(res.json.skipped, `${e.status} ${e.admission}`).toHaveLength(1);
    }
    expect(await db.select().from(storyTags)).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.type, "story_mention"))).toHaveLength(0);
    // Un événement publié ordinaire passe toujours.
    const open = await createEvent(structure.id);
    const res = await publish(kenji, { eventId: open.id });
    expect(res.json.skipped).toEqual([]);
  });
});

describe("plafond des identifications (tour 2)", () => {
  it("la structure de l'autocollant prend une place des dix : la dernière personne est écartée, jamais onze", async () => {
    const orga = await signUp("Orga");
    const kenji = await signUp("Kenji");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id);
    const people: TestUser[] = [];
    for (let i = 0; i < 10; i++) people.push(await signUp(`Plafond_${i}`));
    const res = await publish(kenji, {
      eventId: event.id,
      tags: people.map((p) => ({ kind: "user", id: p.id })),
    });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const rows = await db.select().from(storyTags);
    expect(rows).toHaveLength(10);
    expect(rows.some((r) => r.targetKind === "structure" && r.targetId === structure.id)).toBe(true);
    expect(res.json.skipped).toHaveLength(1);
    expect(res.json.skipped[0]).toMatchObject({ kind: "user", id: people[9]?.id });
    expect(res.json.skipped[0].reason).toContain("Dix identifications");
  });

  it("sans autocollant, dix personnes passent", async () => {
    const kenji = await signUp("Kenji");
    const people: TestUser[] = [];
    for (let i = 0; i < 10; i++) people.push(await signUp(`Plafond_${i}`));
    const res = await publish(kenji, { tags: people.map((p) => ({ kind: "user", id: p.id })) });
    expect(res.json.skipped).toEqual([]);
    expect(await db.select().from(storyTags)).toHaveLength(10);
  });
});

describe("création idempotente (tour 2)", () => {
  it("la même requête reprise (réponse perdue) rend la même story, sans doublon ni 400", async () => {
    const kenji = await signUp("Kenji");
    const key = await uploadKey(kenji);
    const first = await send(kenji, key, { caption: "Sortie de ce matin" });
    expect(first.status, JSON.stringify(first.json)).toBe(201);
    const again = await send(kenji, key, { caption: "Sortie de ce matin" });
    expect(again.status, JSON.stringify(again.json)).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    expect(again.json.expiresAt).toBe(first.json.expiresAt);
    expect(await db.select().from(stories)).toHaveLength(1);
  });

  it("deux envois identiques en même temps : une seule story, les deux reçoivent la même", async () => {
    const kenji = await signUp("Kenji");
    const key = await uploadKey(kenji);
    const [a, b] = await Promise.all([send(kenji, key), send(kenji, key)]);
    expect([a?.status, b?.status]).toEqual([201, 201]);
    expect(a?.json.id).toBe(b?.json.id);
    expect(await db.select().from(stories)).toHaveLength(1);
  });

  it("réponse perdue puis légende modifiée : une seule story, rendue comme reprise (replayed)", async () => {
    const kenji = await signUp("Kenji");
    const key = await uploadKey(kenji);
    const first = await send(kenji, key, { caption: "A" });
    expect(first.status).toBe(201);
    expect(first.json.replayed).toBeUndefined();
    const again = await send(kenji, key, { caption: "B", audience: "followers" });
    expect(again.status, JSON.stringify(again.json)).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    expect(again.json.replayed).toBe(true);
    const rows = await db.select().from(stories);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.caption).toBe("A");
  });

  it("un second envoi qui arrive après l'enregistrement du premier mais avant la lecture du fichier rend la story du premier", async () => {
    const kenji = await signUp("Kenji");
    const key = await uploadKey(kenji);
    const original = storage.get.bind(storage);
    let raced = false;
    let first: Awaited<ReturnType<typeof send>> | undefined;
    const spy = vi.spyOn(storage, "get").mockImplementation(async (k: string) => {
      // Premier appel du second envoi : le premier se termine ici (fichier consommé, source supprimée).
      if (k === key && !raced) {
        raced = true;
        first = await send(kenji, key, { caption: "A" });
        return null;
      }
      return original(k);
    });
    try {
      const second = await send(kenji, key, { caption: "B" });
      expect(first?.status, JSON.stringify(first?.json)).toBe(201);
      expect(second.status, JSON.stringify(second.json)).toBe(201);
      expect(second.json.id).toBe(first?.json.id);
      expect(second.json.replayed).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(await db.select().from(stories)).toHaveLength(1);
  });

  it("la reprise d'un autre compte ne rend jamais la story de quelqu'un d'autre", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const key = await uploadKey(kenji);
    expect((await send(kenji, key)).status).toBe(201);
    expect((await send(nina, key)).status).toBe(400);
  });
});

describe("prestataire et média : l'audience réelle d'un compte privé (tour 2)", () => {
  it("compte privé : même publiée en « abonnés », la story d'une page est celle d'une page publique ; sous le compte, rien (lot R9a)", async () => {
    const owner = await signUp("Presta");
    const fan = await signUp("Abonne");
    const stranger = await signUp("Inconnu");
    await makePrivate(owner);
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: owner.id, type: "photographer", name: "Studio Presta" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: owner.id, name: "Média Presta" }).returning();
    await follow(fan, owner);
    for (const persona of ["provider", "media"] as const) {
      const res = await publish(owner, { persona, audience: "followers" });
      expect(res.status, JSON.stringify(res.json)).toBe(201);
    }
    // Sous le compte du titulaire : jamais ses stories de page, même pour son abonné accepté.
    expect((await req(fan, "GET", `/stories/by-author/u:${owner.id}`)).json.stories ?? []).toHaveLength(0);
    // Sous la clé de la page : tout membre, abonné ou non (une page est publique, D38).
    for (const key of [`v:${prov?.id}`, `m:${med?.id}`]) {
      for (const reader of [fan, stranger]) {
        expect((await req(reader, "GET", `/stories/by-author/${key}`)).json.stories).toHaveLength(1);
      }
    }
  });

  it("une story « publique » de page se lit sous la clé de la page, même d'un compte privé (D38) ; sous le compte, rien", async () => {
    const owner = await signUp("Presta");
    const stranger = await signUp("Inconnu");
    await makePrivate(owner);
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: owner.id, type: "photographer", name: "Studio Presta" })
      .returning();
    const res = await publish(owner, { persona: "provider", audience: "public" });
    expect(res.status).toBe(201);
    const seen = await req(stranger, "GET", `/stories/by-author/v:${prov?.id}`);
    expect(seen.json?.stories ?? []).toHaveLength(1);
    const viaAccount = await req(stranger, "GET", `/stories/by-author/u:${owner.id}`);
    expect(viaAccount.json?.stories ?? []).toHaveLength(0);
  });
});
