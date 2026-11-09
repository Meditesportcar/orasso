import { apiCall, login } from "../helpers";

// Outils communs des recettes du lot R7l2 (votes à thème côté organisateur et staff, appli et site) : l'événement en
// cours « Rassemblement du Lydia » du seed (Sarah propriétaire de Roues Libres 66 ; Damien n'y est qu'invité), ses
// voitures entrées ou pas, le QR d'une voiture, un brouillon d'événement de MéditeSportCar, et le ménage des votes que
// la recette a créés (un vote sans voix se retire, même clos).
export const SLUG = "rassemblement-du-lydia";

export type LydiaRow = { id: string; structure: { id: string; slug: string }; title: string };
export async function lydia(): Promise<LydiaRow> {
  const cookie = await login("sarah@orasso.local");
  const res = await apiCall<LydiaRow>(cookie, "GET", `/events/by-slug/${SLUG}`);
  if (res.status !== 200) throw new Error(`Le Lydia est introuvable (${res.status}) : lancer pnpm db:seed.`);
  return res.data;
}

export type CheckinItem = {
  applicationId: string;
  pseudo: string;
  vehicleLabel: string | null;
  checkedInAt: string | null;
};
export async function checkins(eventId: string): Promise<CheckinItem[]> {
  const cookie = await login("sarah@orasso.local");
  const res = await apiCall<CheckinItem[]>(cookie, "GET", `/events/${eventId}/checkins`);
  return res.data;
}

/** L'adresse du compte du seed d'après son pseudo : « Pilote_007 » → pilote7, « Kenji_66 » → kenji. */
export function seedEmail(pseudo: string): string {
  const [name = "", num = ""] = pseudo.toLowerCase().split("_");
  return name === "pilote" ? `pilote${Number(num)}@orasso.local` : `${name}@orasso.local`;
}

/** Le QR d'accès d'une voiture, tel que son propriétaire le montrerait ; `null` si ce compte n'est pas connu du seed. */
export async function passPayload(item: CheckinItem): Promise<string | null> {
  try {
    const cookie = await login(seedEmail(item.pseudo));
    const res = await apiCall<{ payload: string | null }>(cookie, "GET", `/applications/${item.applicationId}/pass`);
    return res.status === 200 ? res.data.payload : null;
  } catch {
    return null;
  }
}

/** Deux voitures entrées et une retenue pas encore entrée dont le QR est lisible : ce qu'il faut pour les recettes. */
export async function cars(eventId: string) {
  const list = await checkins(eventId);
  const entered = list.filter((i) => i.checkedInAt && i.vehicleLabel);
  const waiting = list.filter((i) => !i.checkedInAt && i.vehicleLabel);
  let outside: { item: CheckinItem; payload: string } | null = null;
  for (const item of waiting) {
    const payload = await passPayload(item);
    if (payload) {
      outside = { item, payload };
      break;
    }
  }
  const scannable: { item: CheckinItem; payload: string }[] = [];
  for (const item of entered.slice(2)) {
    const payload = await passPayload(item);
    if (payload) scannable.push({ item, payload });
    if (scannable.length >= 2) break;
  }
  return { entered, outside, scannable };
}

/** Un brouillon d'événement de MéditeSportCar (jamais publié) : l'éditeur et ses votes d'avant l'événement. */
export async function draftEvent(title: string): Promise<{ id: string; structureId: string; structureSlug: string }> {
  const owner = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(owner, "GET", "/me");
  const structure = me.data.memberships.find((m) => m.structureSlug === "meditesportcar");
  if (!structure) throw new Error("Structure MéditeSportCar introuvable : le seed a-t-il tourné ?");
  const start = new Date(Date.now() + 5 * 24 * 3600_000);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 5 * 3600_000);
  const created = await apiCall<{ id: string }>(owner, "POST", `/structures/${structure.structureId}/events`, {
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.6988,
    lng: 3.0334,
    admittedVehicleTypes: ["car", "moto"],
    capacity: 40,
    maxVehiclesPerUser: 2,
    admission: "filtered",
    publicAccess: "free",
    registrationsOpenAt: new Date(Date.now() - 3600_000).toISOString(),
    previewHours: 0,
    rulesText: "Pas de burn, pas de bruit inutile.",
    description: "Brouillon de recette des votes (lot R7l2).",
  });
  if (created.status !== 201)
    throw new Error(`Création du brouillon : ${created.status} ${JSON.stringify(created.data)}`);
  return { id: created.data.id, structureId: structure.structureId, structureSlug: structure.structureSlug };
}

/** Un vote à la main créé par l'organisateur (API), à lancer soi-même. */
export async function createHandVote(eventId: string, title: string, as = "sarah@orasso.local"): Promise<string> {
  const cookie = await login(as);
  const res = await apiCall<{ id: string }>(cookie, "POST", `/events/${eventId}/votes`, {
    title,
    candidateMode: "hand",
    openMode: "manual",
    durationMinutes: 10,
  });
  if (res.status !== 201) throw new Error(`Création du vote : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}

type ManageItem = {
  id: string;
  title: string;
  kind: string;
  state: string;
  openMode: string;
  durationMinutes: number | null;
  rareStamp: boolean;
  total: number;
  handCandidates: { applicationId: string; entered: boolean; source: string }[] | null;
};
export async function manage(eventId: string, as = "sarah@orasso.local") {
  const cookie = await login(as);
  const res = await apiCall<{ items: ManageItem[]; canWrite: boolean }>(
    cookie,
    "GET",
    `/events/${eventId}/votes/manage`,
  );
  return res.data;
}

/** Retire les votes de recette (titre qui commence par `prefix`) : sans voix, même clos, ils se retirent. */
export async function cleanVotes(eventId: string, prefix: string): Promise<void> {
  const cookie = await login("sarah@orasso.local");
  const res = await apiCall<{ items: ManageItem[] }>(cookie, "GET", `/events/${eventId}/votes/manage`);
  for (const v of res.data?.items ?? []) {
    if (v.title.startsWith(prefix)) await apiCall(cookie, "DELETE", `/events/${eventId}/votes/${v.id}`);
  }
}

/** Retire le brouillon de recette (le propriétaire de MéditeSportCar). */
export async function dropDraft(eventId: string): Promise<void> {
  const owner = await login("damien@orasso.local");
  await apiCall(owner, "POST", `/events/${eventId}/cancel`, { reason: "Recette R7l2" }).catch(() => undefined);
}

/**
 * Un vrai membre du staff (actif, sans droit d'administrateur) de la structure du Lydia : Marc, invité par Sarah puis
 * l'invitation acceptée. Damien n'y est qu'invité, et en super administrateur il passerait pour un organisateur.
 * Idempotent : déjà membre, rien ne change.
 */
export async function lydiaStaff(structureId: string): Promise<string> {
  const email = "marc@orasso.local";
  const owner = await login("sarah@orasso.local");
  await apiCall(owner, "POST", `/structures/${structureId}/members`, { email, role: "staff" });
  const marc = await login(email);
  await apiCall(marc, "POST", `/me/memberships/${structureId}/accept`);
  // Sans rôle, la synchronisation du mode staff est refusée : le contrôle suffit (il ne donne aucun droit sur les votes).
  const me = await apiCall<{ id?: string; user?: { id: string } }>(marc, "GET", "/me");
  const userId = me.data.user?.id ?? me.data.id;
  if (userId)
    await apiCall(owner, "PATCH", `/structures/${structureId}/members/${userId}`, { staffRoles: ["control"] });
  return email;
}
