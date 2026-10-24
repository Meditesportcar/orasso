// Lot 29 (2de partie) : les crews dans la recherche de premier niveau (`GET /search`) : « drift » → crew, carte réduite,
// crews dissous exclus, rien sans compte, cookie et jeton porteur.
import { fromWallTime } from "@orasso/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function search(u: TestUser | null, q: string, mode: "cookie" | "bearer" = "cookie") {
  const res = await app.request(`/api/search?q=${encodeURIComponent(q)}`, {
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
    },
  });
  return {
    status: res.status,
    json: (await res.json()) as { crews: Record<string, unknown>[]; more: { crews: boolean } },
  };
}

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
});

describe("crews dans la recherche de premier niveau", () => {
  it("« drift » trouve le crew ; la carte ne porte ni membres ni chef ; un visiteur n'a rien", async () => {
    const leader = await signUp("Chef_Drift");
    const viewer = await signUp("Viewer_66");
    const made = await call(leader, "POST", "/crews", {
      name: "Roussillon Drift",
      description: "Glisse du dimanche",
      department: "66",
    });
    expect(made.status).toBe(201);
    for (const mode of ["cookie", "bearer"] as const) {
      const res = await search(viewer, "drift", mode);
      expect(res.status).toBe(200);
      expect(res.json.crews).toHaveLength(1);
      const hit = res.json.crews[0] ?? {};
      // Lot R3b : `requested` (ma propre demande en cours, vue par moi) ; rien sur les autres membres.
      expect(Object.keys(hit).sort()).toEqual([
        "department",
        "id",
        "logoUrl",
        "membersCount",
        "name",
        "requested",
        "slug",
      ]);
      expect(hit.requested).toBe(false);
      expect(hit.name).toBe("Roussillon Drift");
      expect(JSON.stringify(res.json.crews)).not.toContain("Chef_Drift");
    }
    expect((await search(null, "drift")).json.crews).toEqual([]);
    expect((await search(viewer, "DRIFT")).json.crews).toHaveLength(1);
    expect((await search(viewer, "%%")).json.crews).toHaveLength(0);
  });

  it("un crew dissous disparaît de la recherche", async () => {
    const leader = await signUp("Chef_Drift");
    const viewer = await signUp("Viewer_66");
    const made = await call(leader, "POST", "/crews", { name: "Roussillon Drift", department: "66" });
    expect((await search(viewer, "drift")).json.crews).toHaveLength(1);
    const del = await call(leader, "DELETE", `/crews/${made.json.id}`);
    expect(del.status).toBeLessThan(300);
    expect((await search(viewer, "drift")).json.crews).toHaveLength(0);
  });

  it("cinq crews par groupe, `more` signale la suite", async () => {
    const viewer = await signUp("Viewer_66");
    for (let i = 0; i < 7; i++) {
      const chief = await signUp(`Chef_${i}`);
      expect((await call(chief, "POST", "/crews", { name: `Team Drift ${i}`, department: "66" })).status).toBe(201);
    }
    const res = await search(viewer, "drift");
    expect(res.json.crews).toHaveLength(5);
    expect(res.json.more.crews).toBe(true);
  });
});
