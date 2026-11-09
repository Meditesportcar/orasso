import pg from "pg";
import { apiCall, login } from "../helpers";

// Outils communs des recettes du lot R7d2 (le direct sur place) : l'événement en cours « Rassemblement du Lydia » du seed,
// ses coordonnées, le bloc `live` vu par un compte, et la remise à zéro des présences des comptes de recette.
export const SLUG = "rassemblement-du-lydia";

export type LiveBlock = {
  phase: "before" | "running" | "after";
  dayIndex: number;
  dayCount: number;
  onSiteCount: number | null;
  acceptedCount: number | null;
  myPresence: "checked_in" | "gps" | "ticket" | null;
  canValidatePresence: boolean;
  votesOpen: number;
};
export type LydiaEvent = {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  structure: { id: string; slug: string };
  live: LiveBlock;
};

/** L'événement et son bloc `live`, lus par un compte (ou sans compte : `email` nul). */
export async function lydia(email: string | null = "damien@orasso.local"): Promise<LydiaEvent> {
  const cookie = email ? await login(email) : null;
  const res = await apiCall<LydiaEvent>(cookie, "GET", `/events/by-slug/${SLUG}`);
  if (res.status !== 200) throw new Error(`Le Lydia est introuvable (${res.status}) : lancer pnpm db:seed.`);
  return res.data;
}

/** Les visiteurs sans voiture du seed, dont la recette remet la présence à zéro (le tampon posé reste : la pose est idempotente). */
export const VISITORS = { success: "noe@orasso.local", far: "hugo@orasso.local", vague: "ines@orasso.local" } as const;

export async function resetPresences(emails: readonly string[]): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `delete from event_presences where user_id in (select id from "user" where email = any($1))
         and event_id = (select id from events where slug = $2)`,
      [emails, SLUG],
    );
  } finally {
    await client.end();
  }
}

/** Mètres vers le nord, en degrés de latitude. */
export const northOf = (lat: number, meters: number) => lat + meters / 111_195;

/** L'accès du Lydia (`free`, `closed`, `paid_external`, `paid_orasso`) pendant `run`, puis remis comme il était (recettes du tour 2). */
export async function withAccess<T>(access: string, run: () => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const before = (await client.query("select public_access from events where slug = $1", [SLUG])).rows[0]
    ?.public_access as string;
  try {
    await client.query("update events set public_access = $1 where slug = $2", [access, SLUG]);
    return await run();
  } finally {
    await client.query("update events set public_access = $1 where slug = $2", [before, SLUG]);
    await client.end();
  }
}
