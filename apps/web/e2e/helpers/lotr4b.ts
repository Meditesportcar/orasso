// Lot R4b : un plateau d'essai pour les recettes (site et appli). Un événement de MéditeSportCar, deux voitures
// retenues : celle d'un compte public et celle d'un compte privé (pseudos uniques, aucune date figée).
import {
  addVehicleApi,
  apiCall,
  applyApi,
  type CreatedEvent,
  createEvent,
  decideApi,
  login,
  randomPlate,
  signUpApi,
  unique,
} from "../helpers";

export type LineupFixture = { event: CreatedEvent; publicPseudo: string; privatePseudo: string };

export async function lineupFixture(): Promise<LineupFixture> {
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Plateau R4b ${unique()}` });
  const tag = unique().slice(-6);
  const publicPseudo = `R4bPub_${tag}`;
  const privatePseudo = `R4bPriv_${tag}`;
  for (const [pseudo, priv] of [
    [publicPseudo, false],
    [privatePseudo, true],
  ] as const) {
    const cookie = await signUpApi(pseudo);
    if (priv) {
      const res = await apiCall(cookie, "PATCH", "/me/profile", { visibility: "private" });
      if (res.status !== 200) throw new Error(`Compte privé : ${res.status} ${JSON.stringify(res.data)}`);
    }
    const vehicleId = await addVehicleApi(cookie, randomPlate());
    const applicationId = await applyApi(cookie, event.id, vehicleId);
    await decideApi(damien, event.id, applicationId, "accept");
  }
  return { event, publicPseudo, privatePseudo };
}

/** Lot R4b, tour 2 : un événement sans voiture retenue, avec un photographe retenu (plateau de pros seulement). */
export async function prosOnlyFixture(): Promise<{ event: CreatedEvent; providerName: string }> {
  const damien = await login("damien@orasso.local");
  const event = await createEvent(damien, { title: `Pros R4b ${unique()}` });
  const patched = await apiCall(damien, "PATCH", `/events/${event.id}`, { vendorTypes: ["Photographe"] });
  if (patched.status !== 200) throw new Error(`Types attendus : ${patched.status}`);
  const providerName = `Photo R4b ${unique()}`;
  const cookie = await signUpApi(`R4bPhoto_${unique().slice(-6)}`);
  const profile = await apiCall(cookie, "PUT", "/me/provider-profile", {
    type: "photographer",
    name: providerName,
    instagram: "@photo.r4b",
  });
  if (profile.status !== 200) throw new Error(`Profil prestataire : ${profile.status} ${JSON.stringify(profile.data)}`);
  const applied = await apiCall<{ id: string }>(cookie, "POST", `/events/${event.id}/provider-applications`, {
    rulesAccepted: true,
    message: null,
  });
  if (applied.status !== 201) throw new Error(`Candidature prestataire : ${applied.status}`);
  await decideApi(damien, event.id, applied.data.id, "accept");
  return { event, providerName };
}
