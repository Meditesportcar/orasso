// Lot R9g, tours 3 et 4 : une reprise et un retrait d'accréditation par leurs vraies routes (le média se retire ; l'organisateur refuse) simultanés ne s'interbloquent pas. La reprise insère la publication (clé
// étrangère : verrou sur l'événement) ; la révocation suit l'ordre du module des candidatures (événement, puis candidature). Sans le verrou
// de l'événement pris en premier par la reprise, les deux se croisent (`40P01`).
import { afterAll, beforeEach, expect, it, vi } from "vitest";

type Gate = { reached: () => void; release: () => void; started: Promise<void>; open: Promise<void> };
/** Une barrière neuve par test : la reprise signale qu'elle est arrivée (`started`), puis attend `release`. */
function newGate(): Gate {
  const g = { reached: () => {}, release: () => {} } as Gate;
  g.started = new Promise<void>((r) => {
    g.reached = r;
  });
  g.open = new Promise<void>((r) => {
    g.release = r;
  });
  return g;
}
let gate = newGate();

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
  gate = newGate();
  await resetDb();
  useClock(paris(11, 5, 12));
  const s = await organizerEvent();
  orga = s.orga;
  eventId = s.event.id;
  const media = await mediaUser("Leo_Media", "Sud Cars");
  leo = media.user;
  applicationId = (await accredit(leo, media.mediaId, eventId)).id;
});

/**
 * Attend (borné) qu'une requête soit **en attente d'un verrou** dans la base : l'état observable qui prouve que la révocation est arrivée
 * au bout de son chemin et bloque sur la reprise (ou l'inverse). Une pause fixe ne prouverait rien.
 */
async function waitForLockWaiter() {
  for (let i = 0; i < 200; i++) {
    const res = await pool.query(
      "select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()",
    );
    if (res.rowCount) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Aucune requête en attente de verrou : la révocation n'a pas rencontré la reprise");
}

const revocations = {
  "le média se retire (lockEventThenApplication)": (path: { eventId: string; applicationId: string }) =>
    call(leo, "POST", `/applications/${path.applicationId}/withdraw`),
  "l'organisateur refuse (decideInTx)": (path: { eventId: string; applicationId: string }) =>
    call(orga, "POST", `/events/${path.eventId}/applications/${path.applicationId}/decide`, {
      decision: "refuse",
      reasons: ["full"],
    }),
};

it.each(Object.entries(revocations))(
  "reprise et retrait de l'accréditation simultanés, par le vrai chemin (%s) : pas d'interblocage",
  async (_name, revoke) => {
    const album = await draftOf(leo, eventId);
    expect((await addPhoto(leo, album.id, { decision: "none" })).status).toBe(201);
    expect((await call(leo, "POST", `/me/albums/${album.id}/publish`)).status).toBe(200);
    const [photo] = await photoRows(album.id);
    const pending = call(orga, "POST", `/events/${eventId}/albums/${album.id}/photos/${photo?.id}/repost`);
    await gate.started;
    // La révocation par son chemin réel, pendant que la reprise est suspendue avant l'insertion ; on attend qu'elle bloque sur un verrou.
    const revoking = revoke({ eventId, applicationId });
    try {
      await waitForLockWaiter();
    } finally {
      // Toujours relâcher la reprise (même si l'attente échoue) : sinon elle garde ses verrous et bloque le test suivant et la fermeture du pool.
      gate.release();
    }
    const [reposted, revoked] = await Promise.all([pending, revoking]);
    expect(reposted.status, reposted.text).toBe(201);
    expect(revoked.status, revoked.text).toBe(200);
  },
);
