// Corrections de la relecture du lot 29 : position arrondie côté serveur, décalage borné, fiches de pros et de
// structures, adresses IPv6.
import { fromWallTime, scrubText } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createEvent,
  createPro,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";
import { ipv6Prefix64 } from "../../lib/search-limit";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const DAY = 86_400_000;
const MODES = ["cookie", "bearer"] as const;
const PARIS = { lat: 48.86, lng: 2.35 };
const PERPIGNAN = { lat: 42.7, lng: 2.89 };

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function get(u: TestUser | null, path: string, mode: (typeof MODES)[number] = "cookie") {
  const res = await app.request(`/api${path}`, {
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
    },
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

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
});

const person = async (pseudo: string) => {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
};
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);

describe("relecture du lot 29", () => {
  it("une position précise envoyée à la main est arrondie au dixième de degré par le serveur", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    await createEvent(s.id, { title: "Paris", ...PARIS });
    const precise = await get(viewer, "/events?sort=distance&lat=48.86871&lng=2.35123");
    const coarse = await get(viewer, "/events?sort=distance&lat=48.9&lng=2.4");
    expect(precise.json.items[0].distanceKm).toBe(coarse.json.items[0].distanceKm);
    // Les erreurs envoyées à GlitchTip ne gardent pas la position.
    expect(scrubText("/api/events?lat=42.69871&lng=2.89543&x=1")).toBe("/api/events?lat=[retiré]&lng=[retiré]&x=1");
  });

  it("un curseur absurde retombe sur le début", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    await createEvent(s.id, { title: "Un" });
    await createPro(owner.id, { name: "Garage" });
    const big = Buffer.from("99999999999999999999999").toString("base64url");
    const neg = Buffer.from("-5").toString("base64url");
    for (const cursor of [big, neg, "!!"]) {
      const events = await get(viewer, `/events?cursor=${cursor}`);
      expect(events.status).toBe(200);
      expect(events.json.items).toHaveLength(1);
      const pros = await get(viewer, `/pros?cursor=${cursor}`);
      expect(pros.status).toBe(200);
      expect(pros.json.items).toHaveLength(1);
    }
  });

  it("pros : recherche dans la description, aucun rayon implicite avec une position", async () => {
    const viewer = await person("Viewer_66");
    const a = await person("Pro_A");
    const b = await person("Pro_B");
    const c = await person("Pro_C");
    const near = await createPro(a.id, { name: "Proche", description: "Spécialiste moteurs japonais", ...PERPIGNAN });
    const far = await createPro(b.id, { name: "Loin", ...PARIS });
    const zone = await createPro(c.id, {
      name: "Zone",
      lat: null,
      lng: null,
      city: null,
      interventionDepartments: ["66"],
    });
    expect(slugs((await get(viewer, "/pros?q=japonais")).json.items)).toEqual([near.slug]);
    const res = await get(viewer, `/pros?lat=${PERPIGNAN.lat}&lng=${PERPIGNAN.lng}`);
    expect(slugs(res.json.items).sort()).toEqual([near.slug, far.slug, zone.slug].sort());
  });

  it("fiche d'un pro dont le titulaire est suspendu : 404 pour les autres, visible du titulaire", async () => {
    const viewer = await person("Viewer_66");
    const a = await person("Pro_A");
    const pro = await createPro(a.id, { name: "Garage" });
    expect((await get(viewer, `/pros/by-slug/${pro.slug}`)).status).toBe(200);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 400 * DAY) })
      .where(eq(profiles.userId, a.id));
    for (const mode of MODES) expect((await get(viewer, `/pros/by-slug/${pro.slug}`, mode)).status).toBe(404);
    expect((await get(null, `/pros/by-slug/${pro.slug}`)).status).toBe(404);
    expect((await get(a, `/pros/by-slug/${pro.slug}`)).status).toBe(200);
  });

  it("page d'une structure non vérifiée : membres seulement", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const pending = await createStructure(owner.id, false);
    for (const mode of MODES) expect((await get(viewer, `/structures/by-slug/${pending.slug}`, mode)).status).toBe(404);
    expect((await get(null, `/structures/by-slug/${pending.slug}`)).status).toBe(404);
    expect((await get(owner, `/structures/by-slug/${pending.slug}`)).status).toBe(200);
    const ok = await createStructure(owner.id);
    expect((await get(viewer, `/structures/by-slug/${ok.slug}`)).status).toBe(200);
  });

  it("IPv6 : les visiteurs sont comptés par préfixe /64", () => {
    expect(ipv6Prefix64("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2");
    expect(ipv6Prefix64("2001:db8:1:2:1111::1")).toBe("2001:db8:1:2");
    expect(ipv6Prefix64("2001:DB8::5")).toBe("2001:db8:0:0");
  });
});
