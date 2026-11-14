// Lot R9g, tour 3 : une reprise et un retrait d'accréditation (route réelle `POST /applications/:id/withdraw`) simultanés ne s'interbloquent pas. La reprise insère la publication (clé
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
let applicationId: string;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  const s = await organizerEvent();
  orga = s.orga;
  eventId = s.event.id;
  const media = await mediaUser("Leo_Media", "Sud Cars");
  leo = media.user;
  applicationId = (await accredit(leo, media.mediaId, eventId)).id;
});

it("reprise et retrait de l'accréditation simultanés (vrai chemin : le média se retire) : pas d'interblocage", async () => {
  const album = await draftOf(leo, eventId);
  expect((await addPhoto(leo, album.id, { decision: "none" })).status).toBe(201);
  expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
  const [photo] = await photoRows(album.id);
  const pending = call(orga, "POST", `/events/${eventId}/albums/${album.id}/photos/${photo?.id}/repost`);
  await gate.started;
  // Le retrait de la candidature par son chemin réel (verrou de l'événement, puis de la candidature), pendant que la reprise est suspendue.
  const withdrawing = call(leo, "POST", `/applications/${applicationId}/withdraw`);
  await new Promise((r) => setTimeout(r, 500));
  gate.release();
  const [reposted, withdrawn] = await Promise.all([pending, withdrawing]);
  expect(reposted.status, reposted.text).toBe(201);
  expect(withdrawn.status, withdrawn.text).toBe(200);
});
