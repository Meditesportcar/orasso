// Lot C5 : la photo de la voiture de l'affiche (`poster_photo_key`) est exposée là où les cartes de l'artefact la
// dessinent (liste, fiche, Accueil, billets de Sorties), à côté de l'affiche générée ; `null` sans photo.
import { fromWallTime } from "@orasso/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { pool } from "../../db/client";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });

let orga: TestUser;
let kenji: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  useClock(paris(6, 10, 10));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  kenji = await signUp("Kenji_66");
  await createVehicle(kenji.id, ref);
});

describe("photo d'événement", () => {
  it("liste et fiche : photoUrl = photo de l'affiche, null sans photo, indépendante de l'affiche générée", async () => {
    const withPhoto = await createEvent(structureId, {
      startsAt: paris(6, 20, 18),
      posterPhotoKey: "event-posters/photo.jpg",
      posterPostKey: "event-posters/post.png",
    });
    const without = await createEvent(structureId, { startsAt: paris(6, 21, 18) });

    const list = await call(null, "GET", "/events");
    expect(list.status).toBe(200);
    const byId = new Map<string, { photoUrl: string | null; generatedPosterUrl: string | null }>(
      list.json.items.map((e: { id: string; photoUrl: string | null; generatedPosterUrl: string | null }) => [e.id, e]),
    );
    expect(byId.get(withPhoto.id)).toMatchObject({
      photoUrl: "/api/files/event-posters/photo.jpg",
      generatedPosterUrl: "/api/files/event-posters/post.png",
    });
    expect(byId.get(without.id)).toMatchObject({ photoUrl: null, generatedPosterUrl: null });

    const page = await call(null, "GET", `/events/by-slug/${withPhoto.slug}`);
    expect(page.json.photoUrl).toBe("/api/files/event-posters/photo.jpg");
    expect((await call(null, "GET", `/events/by-slug/${without.slug}`)).json.photoUrl).toBeNull();
  });

  it("billet de Sorties : la candidature porte la photo et l'affiche de l'événement", async () => {
    const e = await createEvent(structureId, {
      startsAt: paris(6, 20, 18),
      posterPhotoKey: "event-posters/photo.jpg",
      posterPostKey: "event-posters/post.png",
    });
    const v = await viewerOf(kenji);
    const vehicles = await call(kenji, "GET", "/me/vehicles");
    await applicationsService.apply(v, e.id, {
      vehicleIds: [vehicles.json[0].id],
      rulesAccepted: true as const,
      followStructure: true,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    const mine = await call(kenji, "GET", "/me/applications?scope=upcoming");
    expect(mine.status).toBe(200);
    expect(mine.json[0].event).toMatchObject({
      photoUrl: "/api/files/event-posters/photo.jpg",
      posterUrl: "/api/files/event-posters/post.png",
    });
  });
});
