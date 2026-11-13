// Outils des tests des identifications (lot R9f) : un événement avec un album publié par un média, des voitures retenues (pointées ou non), des
// comptes publics et privés. Pas de test ici.
import { eq } from "drizzle-orm";

import { blurPlatesOf, createVehicle, type seedReference, signUp, type TestUser } from "../../../test/helpers";
import { db } from "../../db/client";
import { applications, checkins, eventAlbumPhotos, eventPresences, profiles, vehiclePhotos } from "../../db/schema";
import { accredit, mediaUser, organizerEvent, paris, publishedAlbum } from "./albums-test-helpers";

export type Ref = Awaited<ReturnType<typeof seedReference>>;

/** Une voiture retenue à l'événement (photo à plaque floutée), pointée ou non. */
export async function carAt(
  eventId: string,
  owner: TestUser,
  ref: Ref,
  opts: { status?: "accepted" | "pending" | "waitlisted" | "refused"; checkedIn?: boolean; overrides?: object } = {},
) {
  const vehicle = await createVehicle(owner.id, ref, opts.overrides ?? {});
  await blurPlatesOf(owner.id);
  const [app] = await db
    .insert(applications)
    .values({
      eventId,
      userId: owner.id,
      vehicleId: vehicle.id,
      status: opts.status ?? "accepted",
      rulesAcceptedAt: new Date(0),
      followStructure: false,
      decidedAt: new Date(0),
    })
    .returning();
  if (!app) throw new Error("candidature");
  if (opts.checkedIn ?? true) {
    await db
      .insert(checkins)
      .values({ applicationId: app.id, eventId, method: "manual", checkedInAt: paris(11, 9, 11) });
  }
  return { vehicle, app };
}

export async function makePrivate(userId: string) {
  await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, userId));
}

/** Une présence validée (GPS) : la personne peut être identifiée par son pseudo. */
export async function presentAt(eventId: string, userId: string) {
  await db.insert(eventPresences).values({ eventId, userId, validatedAt: paris(11, 9, 12) });
}

/**
 * Le scénario de base : le Rassemblement du Lydia (organisateur Damien_66 avec second facteur), Leo_Media (Sud Cars) accrédité et auteur d'un
 * album publié de `photos` photos, Dam_66 avec une voiture pointée, Kenji_66 avec une voiture pointée, Priv_66 (compte privé) avec une voiture
 * pointée, Lazy_66 avec une voiture retenue mais non pointée, Marc_Photo (un autre média accrédité).
 */
export async function tagScenario(ref: Ref, photos = 4) {
  const { orga, structure, event } = await organizerEvent();
  const leoAcc = await mediaUser("Leo_Media");
  const leo = leoAcc.user;
  await accredit(leo, leoAcc.mediaId, event.id);
  const marcAcc = await mediaUser("Marc_Photo", "Marc Photo");
  await accredit(marcAcc.user, marcAcc.mediaId, event.id);
  const dam = await signUp("Dam_66");
  const kenji = await signUp("Kenji_66");
  const priv = await signUp("Priv_66");
  await makePrivate(priv.id);
  const lazy = await signUp("Lazy_66");
  const car = {
    dam: await carAt(event.id, dam, ref),
    kenji: await carAt(event.id, kenji, ref),
    priv: await carAt(event.id, priv, ref),
    lazy: await carAt(event.id, lazy, ref, { checkedIn: false }),
  };
  const album = await publishedAlbum(leo, event.id, photos, { allowSave: true });
  const rows = await db
    .select()
    .from(eventAlbumPhotos)
    .where(eq(eventAlbumPhotos.albumId, album.id))
    .orderBy(eventAlbumPhotos.position);
  return {
    orga,
    structure,
    event,
    leo,
    leoMedia: leoAcc.mediaId,
    marc: marcAcc.user,
    dam,
    kenji,
    priv,
    lazy,
    car,
    albumId: album.id,
    photos: rows,
  };
}

/** Le plateau sans photo masquée serait invisible : toutes les voitures du scénario ont une plaque floutée. */
export async function unblurPhotos(vehicleId: string) {
  await db.update(vehiclePhotos).set({ plateBlurred: false }).where(eq(vehiclePhotos.vehicleId, vehicleId));
}
