// Page de vote du site (lot R7-0, tour 3) : une panne passagère après une voix réussie n'est jamais une session expirée
// (pas de redirection vers la connexion) ni un écran d'erreur ; seul un 401 renvoie à la connexion.
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadVote, voteAction } from "./vote.server";

const EVENT = { id: "ev-1", slug: "lydia", title: "Rassemblement du Lydia" };
const MINE = { canVote: true, votedFor: "app-2", closesAt: "2026-11-11T22:00:00.000Z", ownApplicationIds: [] };
const BOARD = { total: 3, entries: [], rankingHidden: false, closesAt: MINE.closesAt, settled: false, open: true };

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
const request = () => new Request("http://site.test/vote/lydia", { headers: { cookie: "s=1" } });
const healthy: Answers = {
  "/me": ok({ user: { id: "u1" } }),
  "/events/by-slug/lydia": ok(EVENT),
  "/audience-prize": ok(BOARD),
  "/audience-prize/mine": ok(MINE),
  "/audience-prize/candidates?cursor=0": ok({ items: [], next: null }),
};

afterEach(() => vi.unstubAllGlobals());

describe("chargeur de la page de vote", () => {
  it("nominal : événement, classement, voix et grille", async () => {
    stubApi(healthy);
    const page = await loadVote(request(), "lydia");
    expect(page).toMatchObject({ event: EVENT, board: BOARD, mine: MINE, candidates: [] });
  });

  it("le classement qui ne se relit pas (500) : la voix reste connue, pas d'erreur", async () => {
    stubApi({ ...healthy, "/audience-prize": fail(500) });
    const page = await loadVote(request(), "lydia");
    expect(page.board).toBeNull();
    expect(page.mine).toMatchObject({ votedFor: "app-2" });
  });

  it("la voix qui ne se relit pas (503, 429) : la page se charge quand même", async () => {
    for (const status of [503, 429]) {
      stubApi({ ...healthy, "/audience-prize/mine": fail(status) });
      const page = await loadVote(request(), "lydia");
      expect(page.mine).toBeNull();
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
      expect(page).toMatchObject({ event: null, board: null, mine: null, slug: "lydia" });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await loadVote(request(), "lydia")).toMatchObject({ event: null, mine: null });
  });

  it("session perdue (401) : la connexion, avec le retour à cette page", async () => {
    stubApi({ ...healthy, "/me": fail(401) });
    const res = await loadVote(request(), "lydia").catch((e) => e as Response);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("location")).toContain("/connexion?retour=");
  });

  it("événement introuvable (404) : l'écran d'erreur habituel, pas une panne", async () => {
    stubApi({ ...healthy, "/events/by-slug/lydia": fail(404) });
    const res = await loadVote(request(), "lydia").catch((e) => e as Response);
    expect((res as Response).status).toBe(404);
  });
});

describe("action de vote", () => {
  const formRequest = () => {
    const form = new FormData();
    form.set("eventId", "ev-1");
    form.set("applicationId", "app-2");
    return new Request("http://site.test/vote/lydia", { method: "POST", body: form, headers: { cookie: "s=1" } });
  };

  it("voix enregistrée : la réponse de l'API revient à la page", async () => {
    stubApi({ "/audience-prize/vote": ok(MINE) });
    const res = (await voteAction(formRequest())) as unknown as { data: { ok: boolean; mine: unknown } };
    expect(res.data).toMatchObject({ ok: true, mine: MINE });
  });

  it("voix refusée : le message de l'API, sans voix", async () => {
    stubApi({ "/audience-prize/vote": Response.json({ error: { code: "vote_closed", message: "Vote clos" } }, { status: 409 }) });
    const res = (await voteAction(formRequest())) as unknown as { data: { ok: boolean; error: string; mine: unknown } };
    expect(res.data).toMatchObject({ ok: false, error: "Vote clos", mine: null });
  });
});
