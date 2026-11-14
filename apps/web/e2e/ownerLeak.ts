import { expect } from "@playwright/test";
import { apiCall, login } from "./helpers";

// Contrôle de confidentialité des recettes R9i (tour 2) : aucune réponse reçue par le navigateur de la personne identifiée ne porte le
// pseudo, l'identifiant ni l'e-mail du titulaire de la page du média. Le contrôle **échoue** quand un corps attendu n'a pas pu être lu
// (erreur de lecture, délai dépassé) : seules les réponses sans corps (204, 205, 304, redirections) et les flux sont écartées ; seuls les
// corps réellement lus comptent, et au moins un corps non vide doit avoir été lu.

export const OWNER_PSEUDO = "Leo_SudCars";
export const OWNER_EMAIL = "leo@orasso.local";

/** Ce qui identifie le titulaire : son pseudo, son e-mail, son identifiant de compte (lu par son propre /me). */
export async function ownerMarkers(): Promise<string[]> {
  const cookie = await login(OWNER_EMAIL);
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  expect(me.status).toBe(200);
  expect(me.data.user.id).toBeTruthy();
  return [OWNER_PSEUDO, OWNER_EMAIL, me.data.user.id];
}

export type ResponseLike = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
};
export type PageLike = { on(event: "response", listener: (res: ResponseLike) => void): unknown };

/** Les réponses qui n'ont, par nature, aucun corps à lire. */
export const hasNoBody = (status: number) =>
  status < 200 || status === 204 || status === 205 || status === 304 || (status >= 300 && status < 400);

/** Les réponses d'API (`/api/`) et, côté site, les données des chargeurs de React Router (`*.data`). */
export const apiOrLoaderData = (url: string) => {
  const u = new URL(url);
  return u.pathname.includes("/api/") || u.pathname.endsWith(".data");
};
export const apiOnly = (url: string) => url.includes("/api/");

type Read = { url: string; text: string | null; problem: string | null };

export function watchOwnerLeak(
  page: PageLike,
  opts: { markers: string[]; match?: (url: string) => boolean; readTimeoutMs?: number },
) {
  const match = opts.match ?? apiOnly;
  const timeoutMs = opts.readTimeoutMs ?? 15_000;
  const reads: Promise<Read>[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (!match(url)) return;
    // Un flux (SSE) ne se termine jamais ; une réponse sans corps n'a rien à lire.
    if (res.headers()["content-type"]?.includes("event-stream")) return;
    if (hasNoBody(res.status())) return;
    reads.push(
      new Promise<Read>((resolve) => {
        const timer = setTimeout(
          () => resolve({ url, text: null, problem: `corps non lu après ${timeoutMs} ms` }),
          timeoutMs,
        );
        res.text().then(
          (text) => {
            clearTimeout(timer);
            resolve({ url, text, problem: null });
          },
          (e: unknown) => {
            clearTimeout(timer);
            resolve({ url, text: null, problem: `lecture impossible (${e instanceof Error ? e.message : String(e)})` });
          },
        );
      }),
    );
  });
  return {
    /** Attend toutes les lectures, puis contrôle : aucune illisible, au moins un corps non vide lu, aucun marqueur du titulaire. */
    async done() {
      const all = await Promise.all(reads);
      expect(
        all.filter((r) => r.problem !== null).map((r) => `${r.url} : ${r.problem}`),
        "des réponses attendues n'ont pas pu être lues : le contrôle ne vaut rien",
      ).toEqual([]);
      const bodies = all.filter((r): r is Read & { text: string } => r.text !== null);
      expect(bodies.filter((r) => r.text.length > 0).length, "aucun corps de réponse lu").toBeGreaterThan(0);
      const lower = opts.markers.map((m) => m.toLowerCase());
      expect(
        bodies.filter((r) => lower.some((m) => r.text.toLowerCase().includes(m))).map((r) => r.url),
        "réponses qui portent le pseudo, l'e-mail ou l'identifiant du titulaire",
      ).toEqual([]);
    },
  };
}
