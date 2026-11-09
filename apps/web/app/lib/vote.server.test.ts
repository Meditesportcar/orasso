// Pages « Votes » et « Vote » du site (lots R7-0 tour 3 et R7l3) : une panne passagère après une voix réussie n'est jamais une
// session expirée (pas de redirection vers la connexion) ni un écran d'erreur ; seul un 401 renvoie à la connexion ; sans
// `vote` dans l'adresse, « Toutes catégories » (ou la liste s'il a été retiré).
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadVote, loadVotes, voteAction } from "./vote.server";

const EVENT = { id: "ev-1", slug: "lydia", title: "Rassemblement du Lydia" };
const VOTE = {
  id: "vote-1",
  eventId: "ev-1",
  title: "Plus belle japonaise",
  kind: "theme",
  state: "open",
  opensAt: null,
  closesAt: "2026-11-11T22:00:00.000Z",
  candidatesCount: 2,
  total: 3,
  myVote: "app-2",
  votedAt: null,
  canVote: true,
  reason: null,
  ranking: [],
  rankingHiddenReason: null,
  rareStamp: false,
  ownApplicationIds: [],
  checkedInAt: null,
  settled: false,
};
const ALL = { ...VOTE, id: "vote-all", title: "Toutes catégories", kind: "all_categories" };

type Answers = Record<string, Response | (() => Response)>;
/** Une API qui répond selon la fin de l'adresse ; une adresse absente = 404. */
function stubApi(answers: Answers) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = Object.keys(answers).find((k) => url.endsWith(k));
      const answer = key ? answers[key] : undefined;
      if (!answer) return Response.json({ error: { code: "not_found", message: "Introuvable" } }, { status: 404 });
      return typeof answer === "function" ? answer() : answer.clone();
    }),
  );
}
const ok = (body: unknown) => Response.json(body);
const fail = (status: number) => Response.json({ error: { code: "internal", message: "Panne" } }, { status });
const request = (query = "?vote=vote-1") =>
  new Request(`http://site.test/app/vote/lydia${query}`, { headers: { cookie: "s=1" } });
const healthy: Answers = {
  "/me": ok({ user: { id: "u1" } }),
  "/events/by-slug/lydia": ok(EVENT),
  "/events/ev-1/votes": ok({ items: [ALL, VOTE] }),
  "/events/ev-1/votes/vote-1": ok(VOTE),
  "/events/ev-1/votes/vote-1/candidates?cursor=0": ok({ items: [], next: null }),
  "/events/ev-1/votes/vote-all": ok(ALL),
  "/events/ev-1/votes/vote-all/candidates?cursor=0": ok({ items: [], next: null }),
};

afterEach(() => vi.unstubAllGlobals());

describe("chargeur de la page d'un vote", () => {
  it("nominal : événement, vote (avec le classement servi) et grille", async () => {
    stubApi(healthy);
    const page = await loadVote(request(), "lydia");
    expect(page).toMatchObject({ event: EVENT, vote: VOTE, candidates: [] });
  });

  it("sans `vote` dans l'adresse : « Toutes catégories »", async () => {
    stubApi(healthy);
    const page = await loadVote(request(""), "lydia");
    expect(page.vote).toMatchObject({ id: "vote-all", kind: "all_categories" });
  });

  it("sans `vote`, et « Toutes catégories » retiré : la liste", async () => {
    stubApi({ ...healthy, "/events/ev-1/votes": ok({ items: [VOTE] }) });
    const res = await loadVote(request(""), "lydia").catch((e) => e as Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("location")).toBe("/app/votes/lydia");
  });

  it("la grille : les candidats entrés d'abord, dans un ordre stable", async () => {
    const c = (applicationId: string, eligible: boolean) => ({
      applicationId,
      vehicleLabel: applicationId,
      pseudo: "p",
      photoUrl: null,
      eligible,
    });
    stubApi({
      ...healthy,
      "/events/ev-1/votes/vote-1/candidates?cursor=0": ok({
        items: [c("c", false), c("b", true), c("a", true)],
        next: null,
      }),
    });
    const page = await loadVote(request(), "lydia");
    expect(page.candidates.map((x) => x.applicationId)).toEqual(["a", "b", "c"]);
  });

  it("le vote qui ne se relit pas (500, 503, 429) : la page se charge quand même, sans erreur", async () => {
    for (const status of [500, 503, 429]) {
      stubApi({ ...healthy, "/events/ev-1/votes/vote-1": fail(status) });
      const page = await loadVote(request(), "lydia");
      expect(page.vote).toBeNull();
      expect(page.event).toEqual(EVENT);
    }
  });

  it("panne de l'API (profil, événement) ou du réseau : jamais la connexion, la page le dit", async () => {
    for (const answers of [
      { ...healthy, "/me": fail(502) },
      { ...healthy, "/events/by-slug/lydia": fail(500) },
    ]) {
      stubApi(answers);
      const page = await loadVote(request(), "lydia");
      expect(page).toMatchObject({ event: null, vote: null, slug: "lydia" });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await loadVote(request(), "lydia")).toMatchObject({ event: null, vote: null });
  });

  it("session perdue (401) : la connexion, avec le retour à cette page", async () => {
    stubApi({ ...healthy, "/me": fail(401) });
    const res = await loadVote(request(), "lydia").catch((e) => e as Response);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("location")).toContain("/connexion?retour=");
  });

  it("événement ou vote introuvable (404) : l'écran d'erreur habituel, pas une panne", async () => {
    stubApi({ ...healthy, "/events/by-slug/lydia": fail(404) });
    expect(((await loadVote(request(), "lydia").catch((e) => e)) as Response).status).toBe(404);
    stubApi({ ...healthy, "/events/ev-1/votes/vote-1": fail(404) });
    expect(((await loadVote(request(), "lydia").catch((e) => e)) as Response).status).toBe(404);
  });
});

describe("chargeur de la liste des votes", () => {
  const listRequest = () => new Request("http://site.test/app/votes/lydia", { headers: { cookie: "s=1" } });

  it("nominal : l'événement et la liste", async () => {
    stubApi(healthy);
    const page = await loadVotes(listRequest(), "lydia");
    expect(page.event).toEqual(EVENT);
    expect(page.list?.items.map((v) => v.id)).toEqual(["vote-all", "vote-1"]);
  });

  it("la liste qui ne se relit pas (503) : la page le dit, pas une erreur ; 401 : la connexion", async () => {
    stubApi({ ...healthy, "/events/ev-1/votes": fail(503) });
    expect(await loadVotes(listRequest(), "lydia")).toMatchObject({ event: EVENT, list: null });
    stubApi({ ...healthy, "/me": fail(401) });
    const res = await loadVotes(listRequest(), "lydia").catch((e) => e as Response);
    expect((res as Response).status).toBe(302);
  });
});

describe("action de vote", () => {
  const formRequest = () => {
    const form = new FormData();
    form.set("eventId", "ev-1");
    form.set("voteId", "vote-1");
    form.set("applicationId", "app-2");
    return new Request("http://site.test/app/vote/lydia", { method: "POST", body: form, headers: { cookie: "s=1" } });
  };

  it("voix enregistrée : la réponse de l'API (avec le classement servi) revient à la page", async () => {
    stubApi({ "/events/ev-1/votes/vote-1/vote": ok(VOTE) });
    const res = (await voteAction(formRequest())) as unknown as { data: { ok: boolean; vote: unknown } };
    expect(res.data).toMatchObject({ ok: true, vote: VOTE });
  });

  it("voix refusée : le message de l'API, sans voix", async () => {
    stubApi({
      "/events/ev-1/votes/vote-1/vote": Response.json(
        { error: { code: "vote_closed", message: "Vote clos" } },
        { status: 409 },
      ),
    });
    const res = (await voteAction(formRequest())) as unknown as { data: { ok: boolean; error: string; vote: unknown } };
    expect(res.data).toMatchObject({ ok: false, error: "Vote clos", vote: null });
  });
});
