import { apiCall, login } from "../helpers";
import { cars, lydia } from "./lotr7l2";

// Outils communs des recettes du lot R7l3 (voter : liste, grille, classement après la voix, trophée) : un vote « à la main »
// créé et lancé par l'organisatrice du Lydia (Sarah) avec des voitures entrées, une voiture retenue pas encore entrée (grisée),
// et ce que l'API répond à un passionné. Les voix et les clôtures sont celles de l'API : la recette ne fait que les provoquer.
export { cars, lydia };

type Candidates = { applicationId: string; pseudo: string; vehicleLabel: string | null; own: boolean };

/** Un vote « à la main » lancé : 3 voitures entrées au moins (dont celle de Damien, pour « C'est toi »), une pas encore entrée. */
export async function openedHandVote(
  title: string,
  durationMinutes = 10,
): Promise<{ eventId: string; slug: string; voteId: string; entered: Candidates[]; waiting: Candidates | null }> {
  const ly = await lydia();
  const sarah = await login("sarah@orasso.local");
  const created = await apiCall<{ id: string }>(sarah, "POST", `/events/${ly.id}/votes`, {
    title,
    candidateMode: "hand",
    openMode: "manual",
    durationMinutes,
  });
  if (created.status !== 201) throw new Error(`Création du vote : ${created.status} ${JSON.stringify(created.data)}`);
  const voteId = created.data.id;
  const { entered, outside } = await cars(ly.id);
  if (entered.length < 3) throw new Error("Le seed du Lydia doit avoir au moins trois voitures entrées.");
  // Damien_66 (entré) d'abord : sa propre voiture est grisée « C'est toi » dans sa grille.
  const damien = entered.find((e) => e.pseudo === "Damien_66");
  const chosen = [...(damien ? [damien] : []), ...entered.filter((e) => e !== damien)].slice(0, 4);
  const out: Candidates[] = [];
  for (const c of chosen) {
    const added = await apiCall(sarah, "POST", `/events/${ly.id}/votes/${voteId}/candidates`, {
      applicationId: c.applicationId,
    });
    if (added.status !== 200 && added.status !== 201)
      throw new Error(`Ajout d'un candidat : ${added.status} ${JSON.stringify(added.data)}`);
    out.push({ applicationId: c.applicationId, pseudo: c.pseudo, vehicleLabel: c.vehicleLabel, own: c === damien });
  }
  let waiting: Candidates | null = null;
  if (outside) {
    const added = await apiCall(sarah, "POST", `/events/${ly.id}/votes/${voteId}/candidates`, {
      applicationId: outside.item.applicationId,
    });
    if (added.status === 200 || added.status === 201)
      waiting = {
        applicationId: outside.item.applicationId,
        pseudo: outside.item.pseudo,
        vehicleLabel: outside.item.vehicleLabel,
        own: false,
      };
  }
  const slug = (await apiCall<{ slug: string }>(sarah, "GET", `/events/by-slug/rassemblement-du-lydia`)).data.slug;
  const opened = await apiCall(sarah, "POST", `/events/${ly.id}/votes/${voteId}/open`);
  if (opened.status !== 200) throw new Error(`Lancement du vote : ${opened.status} ${JSON.stringify(opened.data)}`);
  return { eventId: ly.id, slug, voteId, entered: out, waiting };
}

/** Clôt le vote (Sarah). */
export async function closeVote(eventId: string, voteId: string): Promise<void> {
  const sarah = await login("sarah@orasso.local");
  const res = await apiCall(sarah, "POST", `/events/${eventId}/votes/${voteId}/close`);
  if (res.status !== 200) throw new Error(`Clôture du vote : ${res.status} ${JSON.stringify(res.data)}`);
}

export type VoteSeen = {
  id: string;
  title: string;
  state: string;
  canVote: boolean;
  reason: string | null;
  myVote: string | null;
  ranking: { applicationId: string; votes: number; rank: number }[] | null;
  rankingHiddenReason: string | null;
  ownApplicationIds: string[];
};

/** Ce que l'API répond à `email` pour ce vote. */
export async function voteSeenBy(email: string, eventId: string, voteId: string): Promise<VoteSeen> {
  const cookie = await login(email);
  const res = await apiCall<VoteSeen>(cookie, "GET", `/events/${eventId}/votes/${voteId}`);
  if (res.status !== 200) throw new Error(`Lecture du vote par ${email} : ${res.status}`);
  return res.data;
}

/** Une voix donnée par l'API (pour préparer un classement). */
export async function castBy(email: string, eventId: string, voteId: string, applicationId: string) {
  const cookie = await login(email);
  return apiCall<VoteSeen>(cookie, "PUT", `/events/${eventId}/votes/${voteId}/vote`, { applicationId });
}
