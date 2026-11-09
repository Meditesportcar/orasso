// Lot R7k2 : outils communs aux recettes de la carte « Sponsorisé » du Fil (appli et site). Un emplacement de recette est
// créé par l'API d'administration, les autres emplacements du Fil sont mis en pause le temps du test (et remis après),
// et chaque test prend une personne neuve (le comptage de l'API est « une fois par personne, par jour et par endroit »).
import { apiCall, type Cookie, login, SEED_PASSWORD, samplePhoto, signUpApi, unique } from "./helpers";

const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export type Placement = {
  id: string;
  advertiserKind: "pro" | "external";
  proProfileId: string | null;
  title: string;
  status: string;
  surfaces: string[];
  impressions: number;
  clicks: number;
  bySurface: Record<string, { impressions: number; clicks: number }>;
};

export const adminCookie = () => login("damien@orasso.local");

export async function listPlacements(admin: Cookie): Promise<Placement[]> {
  return (await apiCall<Placement[]>(admin, "GET", "/admin/sponsored-placements")).data;
}

export async function placementById(admin: Cookie, id: string): Promise<Placement> {
  const found = (await listPlacements(admin)).find((p) => p.id === id);
  if (!found) throw new Error(`Emplacement ${id} introuvable`);
  return found;
}

/** Met en pause tous les emplacements actifs du Fil sauf `keep` ; renvoie la remise en état. */
export async function pauseOthers(admin: Cookie, keep: string | null): Promise<() => Promise<void>> {
  const others = (await listPlacements(admin)).filter(
    (p) => p.status === "active" && p.surfaces.includes("feed") && p.id !== keep,
  );
  for (const p of others) await apiCall(admin, "PATCH", `/admin/sponsored-placements/${p.id}`, { status: "paused" });
  return async () => {
    for (const p of others) await apiCall(admin, "PATCH", `/admin/sponsored-placements/${p.id}`, { status: "active" });
  };
}

export async function setExternalEnabled(admin: Cookie, value: boolean): Promise<void> {
  const r = await apiCall(admin, "PUT", "/admin/settings/sponsored.external_enabled", { value });
  if (r.status !== 200) throw new Error(`Réglage sponsored.external_enabled : ${r.status}`);
}

export type NewPlacement = {
  kind?: "pro" | "external";
  title?: string;
  body?: string;
  disclosure?: string | null;
  departments?: string[];
  dailyCap?: number | null;
  image?: boolean;
  linkUrl?: string;
  advertiserName?: string;
};

/** Crée un emplacement actif sur le Fil (un pro : celui d'un emplacement existant ; sinon un annonceur externe). */
export async function createFeedPlacement(admin: Cookie, o: NewPlacement = {}): Promise<{ id: string; title: string }> {
  const kind = o.kind ?? "pro";
  const title = o.title ?? `Recette ${unique()}`.slice(0, 60);
  const pro =
    kind === "pro" ? (await listPlacements(admin)).find((p) => p.advertiserKind === "pro" && p.proProfileId) : null;
  if (kind === "pro" && !pro) throw new Error("Aucun pro dans les emplacements du seed");
  const day = new Date().toISOString().slice(0, 10);
  const created = await apiCall<{ id: string }>(admin, "POST", "/admin/sponsored-placements", {
    advertiserKind: kind,
    ...(kind === "pro"
      ? { proProfileId: pro?.proProfileId }
      : { advertiserName: o.advertiserName ?? "Assurance Soleil" }),
    disclosure: o.disclosure === undefined ? "Publicité" : o.disclosure,
    surfaces: ["feed"],
    title,
    body: o.body ?? "Un texte court pour la recette de la carte.",
    linkUrl: o.linkUrl ?? "https://orasso.fr",
    departments: o.departments ?? ["66"],
    startsOn: day,
    endsOn: "2027-12-31",
    dailyCap: o.dailyCap === undefined ? 500 : o.dailyCap,
    status: "active",
  });
  if (created.status !== 201)
    throw new Error(`Création de l'emplacement : ${created.status} ${JSON.stringify(created.data)}`);
  if (o.image) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(samplePhoto())], { type: "image/jpeg" }), "annonce.jpg");
    const res = await fetch(`${API}/api/admin/sponsored-placements/${created.data.id}/image`, {
      method: "POST",
      headers: { origin: WEB, cookie: admin },
      body: form,
    });
    if (!res.ok) throw new Error(`Image de l'emplacement : ${res.status}`);
  }
  return { id: created.data.id, title };
}

export async function deletePlacement(admin: Cookie, id: string): Promise<void> {
  await apiCall(admin, "DELETE", `/admin/sponsored-placements/${id}`);
}

/** Une personne neuve du département 66 (son Fil montre la carte Sponsorisé en 4e position). */
export async function freshUser(): Promise<{ email: string; pseudo: string; cookie: Cookie }> {
  const pseudo = `Rk${unique()}`.slice(0, 12);
  const cookie = await signUpApi(pseudo);
  return { email: `${pseudo.toLowerCase()}@e2e.orasso.test`, pseudo, cookie };
}

export { SEED_PASSWORD };
