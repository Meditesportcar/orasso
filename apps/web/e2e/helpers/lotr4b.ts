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
