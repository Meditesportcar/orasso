// Correctif cache et session (11/11) : une réponse à cache public ne porte jamais de `Set-Cookie`. Les routes à cache
// public sont montées avant `loadSession` (aucune lecture de session), et un filet de sécurité réécrit en `private`
// tout `Cache-Control` public qui accompagnerait un `Set-Cookie`.
import { Hono } from "hono";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEvent, createPro, createStructure, resetDb, signUp, type TestUser, useClock } from "../../test/helpers";
import { app } from "../app";
import { pool } from "../db/client";
import { cacheGuard, privateIfSetCookie } from "./cache-guard";

const DAY = 24 * 3600 * 1000;
const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
let fan: TestUser;
let paths: string[];

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  const start = new Date();
  vi.setSystemTime(start);
  clock = useClock(start);
  fan = await signUp("Fan_Cache");
  const structure = await createStructure(fan.id);
  const event = await createEvent(structure.id);
  await createPro(fan.id);
  paths = [
    "/api/keys",
    `/api/events/by-slug/${event.slug}/weather`,
    "/api/settings/public",
    "/api/structures",
    `/api/structures/by-slug/${structure.slug}/pros`,
  ];
  // La session est vieillie : le prochain passage par `loadSession` la prolonge et renouvelle son cookie.
  const next = new Date(Date.now() + 2 * DAY);
  vi.setSystemTime(next);
  clock.set(next);
});

afterEach(() => {
  vi.useRealTimers();
});

const tokenCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.includes("better-auth.session_token="));

describe("cache public et session", () => {
  it("contrôle : une route derrière la session renouvelle le cookie d'une session vieillie", async () => {
    const res = await app.request("/api/me", { headers: { origin: ORIGIN, cookie: fan.cookie } });
    expect(res.status).toBe(200);
    expect(tokenCookie(res), "cookie de session renouvelé").toBeTruthy();
  });

  it("aucune route à cache public ne pose de Set-Cookie, même avec une session à renouveler", async () => {
    for (const path of paths) {
      const res = await app.request(path, { headers: { origin: ORIGIN, cookie: fan.cookie } });
      expect(res.status, path).toBe(200);
      expect(res.headers.get("cache-control"), path).toMatch(/\bpublic\b/);
      expect(res.headers.getSetCookie(), path).toEqual([]);
    }
    // La session n'a pas été lue : elle se renouvelle encore au premier passage derrière `loadSession`.
    const me = await app.request("/api/me", { headers: { origin: ORIGIN, cookie: fan.cookie } });
    expect(tokenCookie(me)).toBeTruthy();
  });
});

describe("filet de sécurité", () => {
  it("réécrit un Cache-Control public en private quand la réponse porte un Set-Cookie", async () => {
    const probe = new Hono()
      .use("*", cacheGuard)
      .get("/with-cookie", (c) => {
        c.header("set-cookie", "a=b; Path=/", { append: true });
        return c.json({}, 200, { "cache-control": "public, max-age=60, s-maxage=120" });
      })
      .get("/without-cookie", (c) => c.json({}, 200, { "cache-control": "public, max-age=60" }))
      .get("/private", (c) => {
        c.header("set-cookie", "a=b", { append: true });
        return c.json({}, 200, { "cache-control": "private, no-store" });
      });
    const withCookie = await probe.request("/with-cookie");
    expect(withCookie.headers.get("cache-control")).toBe("private, max-age=60");
    expect(withCookie.headers.getSetCookie()).toEqual(["a=b; Path=/"]);
    expect((await probe.request("/without-cookie")).headers.get("cache-control")).toBe("public, max-age=60");
    expect((await probe.request("/private")).headers.get("cache-control")).toBe("private, no-store");
  });

  it("privateIfSetCookie garde la durée et retire les directives des caches partagés", () => {
    expect(privateIfSetCookie("public, max-age=3600")).toBe("private, max-age=3600");
    expect(privateIfSetCookie("max-age=60, Public, s-maxage=30, proxy-revalidate")).toBe("max-age=60, private");
  });
});
