// Lot R9f, partie 2 : « Contacter <média> » depuis « Tes photos ». La conversation s'ouvre avec le titulaire de la page du média sans que son
// compte soit servi ; les règles du message direct s'appliquent (jamais un message à quelqu'un qui ne me suit pas).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { userFollows } from "../../db/schema";
import { paris } from "./albums-test-helpers";
import { type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 2);
});

describe("Contacter le média", () => {
  it("le titulaire ne me suit pas : 409 not_friends, aucun compte dans la réponse", async () => {
    const res = await call(s.dam, "POST", `/albums/${s.albumId}/contact`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("not_friends");
    expect(JSON.stringify(res.json)).not.toContain(s.leo.id);
  });
  it("le titulaire me suit : la conversation s'ouvre (201), puis la même (200) ; seulement { id, created }", async () => {
    await db
      .insert(userFollows)
      .values({ followerId: s.leo.id, followedId: s.dam.id, status: "accepted", acceptedAt: new Date() });
    const first = await call(s.dam, "POST", `/albums/${s.albumId}/contact`);
    expect(first.status).toBe(201);
    expect(Object.keys(first.json).sort()).toEqual(["created", "id"]);
    const again = await call(s.dam, "POST", `/albums/${s.albumId}/contact`);
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(first.json.id);
  });
  it("le titulaire lui-même : refusé ; sans session : 401 ; album inconnu : 404", async () => {
    expect((await call(s.leo, "POST", `/albums/${s.albumId}/contact`)).status).toBe(400);
    expect((await call(null, "POST", `/albums/${s.albumId}/contact`)).status).toBe(401);
    expect((await call(s.dam, "POST", "/albums/00000000-0000-4000-8000-000000000000/contact")).status).toBe(404);
  });
});
