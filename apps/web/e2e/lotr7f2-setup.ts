import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { apiCall, type Cookie } from "./helpers";

// Outils des recettes du lot R7f2 (stories, lecture) : une story publiée par l'API avec une photo de démonstration relue
// « aucune plaque lisible » (jamais `scirocco-plaque-lisible.jpg`), des lectures de la base de recette.
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function userIdOf(pseudo: string): Promise<string> {
  const rows = await sql<{ user_id: string }>("select user_id from profiles where lower(pseudo) = lower($1)", [pseudo]);
  const id = rows[0]?.user_id;
  if (!id) throw new Error(`Compte ${pseudo} introuvable`);
  return id;
}

/** Publie une story photo (voiture de démonstration, plaque : « aucune plaque visible » confirmée). */
export async function publishStory(
  cookie: Cookie,
  over: Record<string, unknown> = {},
  photo = "car-mx5.jpg",
): Promise<string> {
  const form = new FormData();
  form.append("purpose", "story");
  form.append("file", new File([readFileSync(`${PHOTOS}/${photo}`)], photo, { type: "image/jpeg" }));
  const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { cookie, origin: WEB }, body: form });
  const uploaded = (await up.json()) as { key?: string };
  if (up.status !== 201 || !uploaded.key) throw new Error(`Envoi de la photo : ${up.status}`);
  const res = await apiCall<{ id: string }>(cookie, "POST", "/me/stories", {
    uploadKey: uploaded.key,
    noPlateConfirmed: true,
    audience: "followers",
    persona: "fan",
    tags: [],
    ...over,
  });
  if (res.status !== 201) throw new Error(`Story : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}

/** Retire une story de test (appel de l'auteur) sans échec si elle n'existe plus. */
export async function dropStory(cookie: Cookie, id: string): Promise<void> {
  await apiCall(cookie, "DELETE", `/me/stories/${id}`);
}

/** Retire toutes mes stories vivantes (avant et après une recette qui en crée). */
export async function dropMyStories(cookie: Cookie): Promise<void> {
  const mine = await apiCall<{ stories: { id: string }[] }>(cookie, "GET", "/me/stories");
  for (const s of mine.data?.stories ?? []) await dropStory(cookie, s.id);
}
