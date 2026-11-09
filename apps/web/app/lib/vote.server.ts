// Votes sur le site : chargeurs et action des pages « Votes » (la liste) et « Vote » (un vote), lots R7-0 (tour 3) et R7l3. Une
// panne passagère (5xx, réseau, 429) n'est jamais traitée comme une session expirée ni comme une page d'erreur : après une
// voix réussie, la page garde la confirmation et propose « Réessayer ». Seuls un 401 (session perdue) renvoie à la
// connexion, et un 4xx de l'API (événement ou vote introuvable, hors de portée) aux écrans d'erreur habituels. Les règles
// (qui vote, quand le classement est servi) sont celles de l'API : la page affiche ce qu'elle répond.
import {
  collectPages,
  type EventPublic,
  type VoteCandidate,
  type VoteCandidates,
  type VoteList,
  type VoteView,
} from "@orasso/shared";
import { data, redirect } from "react-router";

import { type ApiResult, api, loginUrl, safeReturn } from "./api.server";
import { nowMs } from "./clock";

type EventRef = { id: string; slug: string; title: string };

export type VotePage = {
  back: string;
  slug: string;
  /** `null` : l'événement ne s'est pas relu (panne passagère). */
  event: EventRef | null;
  /** `null` : le vote ne s'est pas relu (panne passagère) ; la voix qui vient d'être donnée reste affichée. */
  vote: VoteView | null;
  candidates: VoteCandidate[];
  /** Faux : une page de la grille n'a pas pu être lue (la grille est partielle ou vide **par panne**, pas par nature). */
  candidatesComplete: boolean;
  /** Heure d'Orasso du serveur quand la page a été lue : le navigateur en déduit son écart (clôture du vote). */
  serverAt: number;
};

export type VotesPage = {
  back: string;
  slug: string;
  event: EventRef | null;
  /** `null` : la liste ne s'est pas relue (panne passagère). */
  list: VoteList | null;
  serverAt: number;
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

/** Le ✕ revient à l'écran d'origine (`?retour=`, chemin interne seulement). */
const backOf = (request: Request, fallback: string) =>
  safeReturn(new URL(request.url).searchParams.get("retour"), fallback);

async function eventOf(request: Request, slug: string): Promise<EventRef | null> {
  const me = await api(request, "/me");
  if (!settle(request, me)) return null;
  const res = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  if (!settle(request, res)) return null;
  return { id: res.data.id, slug: res.data.slug, title: res.data.title };
}

/** `/app/votes/:slug` : la liste des votes d'un événement. */
export async function loadVotes(request: Request, slug: string): Promise<VotesPage> {
  const back = backOf(request, "/app/sorties");
  const event = await eventOf(request, slug);
  if (!event) return { back, slug, event: null, list: null, serverAt: nowMs() };
  const res = await api<VoteList>(request, `/events/${event.id}/votes`);
  const list = settle(request, res) ? res.data : null;
  return { back, slug, event, list, serverAt: nowMs() };
}

/**
 * `/app/vote/:slug?vote=<id>` : un vote. Sans `vote` : « Toutes catégories » (anciens liens), ou la liste s'il a été retiré.
 */
export async function loadVote(request: Request, slug: string): Promise<VotePage> {
  const back = backOf(request, "/app/sorties");
  const unavailable: VotePage = {
    back,
    slug,
    event: null,
    vote: null,
    candidates: [],
    // Rien n'a été relu : la grille vide n'est pas « aucune voiture », c'est une relecture qui a échoué (« Réessayer »).
    candidatesComplete: false,
    serverAt: nowMs(),
  };
  const event = await eventOf(request, slug);
  if (!event) return unavailable;
  let voteId = new URL(request.url).searchParams.get("vote");
  if (!voteId) {
    const res = await api<VoteList>(request, `/events/${event.id}/votes`);
    if (!settle(request, res)) return { ...unavailable, event };
    const all = res.data.items.find((v) => v.kind === "all_categories");
    if (!all) throw redirect(`/app/votes/${encodeURIComponent(slug)}`);
    voteId = all.id;
  }
  const voteRes = await api<VoteView>(request, `/events/${event.id}/votes/${encodeURIComponent(voteId)}`);
  const vote = settle(request, voteRes) ? voteRes.data : null;
  // La grille : les candidats (pages de l'API), dans un ordre stable sans rapport avec le classement.
  // Toutes les pages, sans plafond de 2 000 candidats ; une page en échec rend la grille partielle et le dit (jamais « vide »).
  const { items: candidates, complete: candidatesComplete } = await collectPages<VoteCandidate>(async (cursor) => {
    const res: ApiResult<VoteCandidates> = await api<VoteCandidates>(
      request,
      `/events/${event.id}/votes/${encodeURIComponent(voteId)}/candidates?cursor=${cursor}`,
    );
    if (!res.ok) throw new Error("page");
    return res.data;
  });
  candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.applicationId.localeCompare(b.applicationId));
  return { back, slug, event, vote, candidates, candidatesComplete, serverAt: nowMs() };
}

/** La voix : la réponse de l'API (le vote, avec le classement que j'ai maintenant le droit de voir) revient à la page. */
export async function voteAction(request: Request) {
  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  const voteId = String(form.get("voteId") ?? "");
  const res = await api<VoteView>(
    request,
    `/events/${encodeURIComponent(eventId)}/votes/${encodeURIComponent(voteId)}/vote`,
    { method: "PUT", json: { applicationId: String(form.get("applicationId") ?? "") } },
  );
  if (!res.ok) return data({ error: res.error.message, ok: false, vote: null, eventId }, { status: res.status });
  // `eventId` : la confirmation reste affichée même si la relecture de l'événement échoue ensuite.
  return data({ error: null, ok: true, vote: res.data, eventId });
}
