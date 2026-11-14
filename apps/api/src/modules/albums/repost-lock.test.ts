// Lot R9g, tour 3 : une reprise et une révocation d'accréditation simultanées ne s'interbloquent pas. La reprise insère la publication (clé
// étrangère : verrou sur l'événement) ; la révocation suit l'ordre du module des candidatures (événement, puis candidature). Sans le verrou
// de l'événement pris en premier par la reprise, les deux se croisent (`40P01`).
import { afterAll, beforeEach, expect, it, vi } from "vitest";

const gate = {
  reached: () => {},
  release: () => {},
  started: null as unknown as Promise<void>,
  open: null as unknown as Promise<void>,
};
gate.started = new Promise<void>((r) => {
  gate.reached = r;
});
gate.open = new Promise<void>((r) => {
  gate.release = r;
});

// La reprise s'arrête juste avant l'insertion de la publication : le temps de lancer la révocation.
vi.mock("../feed/publish", async (orig) => {
  const real = (await orig()) as typeof import("../feed/publish");
  return {
    ...real,
    insertPostWithPhotos: async (...args: Parameters<typeof real.insertPostWithPhotos>) => {
      gate.reached();
      await gate.open;
      return real.insertPostWithPhotos(...args);
    },
  };
});

import { call, resetDb, type TestUser, useClock } from "../../../test/helpers";
import { pool } from "../../db/client";
import { accredit, addPhoto, draftOf, mediaUser, organizerEvent, paris, photoRows } from "./albums-test-helpers";

afterAll(async () => {
  await pool.end();
});

let orga: TestUser;
let eventId: string;
let leo: TestUser;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  const s = await organizerEvent();
  orga = s.orga;
  eventId = s.event.id;
  const media = await mediaUser("Leo_Media", "Sud Cars");
  leo = media.user;
  await accredit(leo, media.mediaId, eventId);
});

it("reprise et révocation simultanées : pas d'interblocage (la reprise aboutit, puis la révocation)", async () => {
  const album = await draftOf(leo, eventId);
  expect((await addPhoto(leo, album.id, { decision: "none" })).status).toBe(201);
  expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
  const [photo] = await photoRows(album.id);
  const pending = call(orga, "POST", `/events/${eventId}/albums/${album.id}/photos/${photo?.id}/repost`);
  await gate.started;
  // La révocation, dans l'ordre de `decideInTx` : l'événement `for update`, puis la candidature.
  const client = await pool.connect();
  let revoked: string;
  try {
    await client.query("begin");
    const revocation = (async () => {
      await client.query("select 1 from events where id = $1 for update", [eventId]);
      await client.query("update applications set status = 'refused' where event_id = $1 and kind = 'media'", [
        eventId,
      ]);
    })().then(
      () => "ok",
      (e: { code?: string }) => `erreur ${e.code}`,
    );
    await new Promise((r) => setTimeout(r, 500));
    gate.release();
    const [reposted, outcome] = await Promise.all([pending, revocation]);
    revoked = outcome;
    expect(reposted.status).toBe(201);
    await client.query("commit");
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
  expect(revoked).toBe("ok");
});
