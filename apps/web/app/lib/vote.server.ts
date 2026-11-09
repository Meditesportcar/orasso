// Prix du public sur le site : chargeur et action de la page de vote (lot R7-0, tour 3). Une panne passagère (5xx,
// réseau, 429) n'est jamais traitée comme une session expirée ni comme une page d'erreur : après une voix réussie, la
// page garde la confirmation et propose « Réessayer ». Seuls un 401 (session perdue) renvoie à la connexion, et un
// 4xx de l'API (événement introuvable, hors de portée) aux écrans d'erreur habituels.
import type {
  AudienceCandidate,
  AudienceCandidates,
  AudiencePrizeBoard,
  AudiencePrizeMine,
  EventPublic,
} from "@orasso/shared";
import { data, redirect } from "react-router";

import { type ApiResult, api, loginUrl, safeReturn } from "./api.server";

export type VotePage = {
  back: string;
  slug: string;
  /** `null` : l'événement ne s'est pas relu (panne passagère). */
  event: { id: string; slug: string; title: string } | null;
  board: AudiencePrizeBoard | null;
  mine: AudiencePrizeMine | null;
  candidates: AudienceCandidate[];
};

/** Une panne de l'API ou du réseau : à réessayer, pas une décision. */
const transient = (res: { status: number }) => res.status >= 500 || res.status === 429;

/** 401 : connexion ; autre 4xx : écran d'erreur habituel ; panne passagère : `false` (la page le dit). */
function settle<T>(request: Request, res: ApiResult<T>): res is Extract<ApiResult<T>, { ok: true }> {
  if (res.ok) return true;
  if (res.status === 401) throw redirect(loginUrl(request));
  if (!transient(res)) {
    throw new Response(res.error.message, { status: res.status, statusText: res.error.message });
  }
  return false;
}

export async function loadVote(request: Request, slug: string): Promise<VotePage> {
  // Lot M7, tour 2 : le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement).
  const back = safeReturn(new URL(request.url).searchParams.get("retour"), "/app/sorties");
  const unavailable: VotePage = { back, slug, event: null, board: null, mine: null, candidates: [] };
  const me = await api(request, "/me");
  if (!settle(request, me)) return unavailable;
  const eventRes = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  if (!settle(request, eventRes)) return unavailable;
  const event = { id: eventRes.data.id, slug: eventRes.data.slug, title: eventRes.data.title };
  const [boardRes, mineRes] = await Promise.all([
    api<AudiencePrizeBoard>(request, `/events/${event.id}/audience-prize`),
    api<AudiencePrizeMine>(request, `/events/${event.id}/audience-prize/mine`),
  ]);
  // Le classement n'est servi qu'après la voix : s'il ne se relit pas, la page le dit avec « Réessayer ».
  const board = settle(request, boardRes) ? boardRes.data : null;
  const mine = settle(request, mineRes) ? mineRes.data : null;
  // La grille : tous les véhicules pointés (pages de l'API), dans un ordre stable sans rapport avec le classement.
  const candidates: AudienceCandidate[] = [];
  let cursor: number | null = 0;
  for (let guard = 0; cursor !== null && guard < 20; guard++) {
    const res: ApiResult<AudienceCandidates> = await api<AudienceCandidates>(
      request,
      `/events/${event.id}/audience-prize/candidates?cursor=${cursor}`,
    );
    if (!res.ok) break;
    candidates.push(...res.data.items);
    cursor = res.data.next;
  }
  candidates.sort((a, b) => a.applicationId.localeCompare(b.applicationId));
  return { back, slug, event, board, mine, candidates };
}

/** La voix : la réponse de l'API (`mine`) revient à la page, qui s'en sert si la relecture qui suit échoue. */
export async function voteAction(request: Request) {
  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  const res = await api<AudiencePrizeMine>(request, `/events/${encodeURIComponent(eventId)}/audience-prize/vote`, {
    method: "PUT",
    json: { applicationId: String(form.get("applicationId") ?? "") },
  });
  if (!res.ok) return data({ error: res.error.message, ok: false, mine: null }, { status: res.status });
  return data({ error: null, ok: true, mine: res.data });
}
