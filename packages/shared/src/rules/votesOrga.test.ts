import { describe, expect, it } from "vitest";

import type { VoteCandidateAdded, VoteManageItem } from "../schemas/votes";
import {
  emptyVoteDraft,
  voteCandidatesSummary,
  voteConfigLine,
  voteDraftBody,
  voteDraftDuration,
  voteDraftOfItem,
  voteDraftProblem,
  voteDraftWithMode,
  voteDraftWithTemplate,
  voteDurationLabel,
  voteScanMessage,
  voteScanOutcome,
  voteSearchView,
  voteStaleMinutes,
  voteStatus,
  voteWhen,
} from "./votesOrga";

// Mardi 10 novembre 2026, 13 h 14 à Paris.
const NOW = new Date("2026-11-10T12:14:00Z");

const item = (over: Partial<VoteManageItem> = {}): VoteManageItem => ({
  id: "v1",
  title: "Concours de rupteur",
  kind: "theme",
  candidateMode: "hand",
  candidateFilter: null,
  openMode: "manual",
  opensAt: null,
  durationMinutes: 10,
  state: "upcoming",
  openedAt: null,
  closedAt: null,
  closesAt: "2026-11-10T22:00:00Z",
  rareStamp: false,
  position: 1,
  candidatesCount: 5,
  total: 0,
  ranking: [],
  handCandidates: [],
  settled: false,
  ...over,
});

const ctx = { now: NOW, published: true, canWrite: true };

describe("voteWhen", () => {
  it("dit « à 23 h » le jour même, le jour de la semaine dans les six jours, la date au-delà", () => {
    expect(voteWhen(new Date("2026-11-10T22:00:00Z"), NOW, true)).toBe("à 23 h");
    expect(voteWhen(new Date("2026-11-10T22:00:00Z"), NOW)).toBe("aujourd'hui 23 h");
    expect(voteWhen(new Date("2026-11-11T14:30:00Z"), NOW, true)).toBe("demain à 15 h 30");
    expect(voteWhen(new Date("2026-11-14T22:00:00Z"), NOW, true)).toBe("samedi à 23 h");
    expect(voteWhen(new Date("2026-11-20T22:00:00Z"), NOW)).toBe("20 nov. 23 h");
    expect(voteWhen(new Date("2027-01-20T22:00:00Z"), NOW, true)).toContain("2027");
  });
});

describe("voteDurationLabel", () => {
  it("minutes, heures, fin de l'événement", () => {
    expect(voteDurationLabel(null)).toBe("Jusqu'à la fin de l'événement");
    expect(voteDurationLabel(10)).toBe("10 min");
    expect(voteDurationLabel(60)).toBe("1 h");
    expect(voteDurationLabel(90)).toBe("1 h 30");
  });
});

describe("voteStatus (écran « Votes »)", () => {
  it("ouvert : voix et heure de fermeture, « Clore maintenant » pour qui écrit seulement", () => {
    const open = item({ state: "open", total: 34, closesAt: "2026-11-10T22:00:00Z" });
    const s = voteStatus(open, ctx);
    expect(s).toMatchObject({ tone: "open", canClose: true, canLaunch: false });
    expect(s.text).toBe("Ouvert · 34 voix · ferme à 23 h");
    expect(voteStatus({ ...open, closesAt: "2026-11-14T22:00:00Z" }, ctx).text).toContain("ferme samedi à 23");
    expect(voteStatus(open, { ...ctx, canWrite: false })).toMatchObject({ canClose: false, canLaunch: false });
  });

  it("prévu à l'heure : la date, et « Lancer le vote » pour avancer", () => {
    const planned = item({
      openMode: "at",
      opensAt: "2026-11-14T15:00:00Z",
      candidateMode: "origins",
      candidatesCount: 6,
    });
    expect(voteStatus(planned, ctx)).toMatchObject({ tone: "plan", canLaunch: true, launchBlocked: null });
    expect(voteStatus(planned, ctx).text).toBe("Prévu · samedi 16 h");
  });

  it("l'heure prévue est passée sans assez de candidats : « À lancer · moins de deux candidats entrés »", () => {
    const late = item({ openMode: "at", opensAt: "2026-11-10T11:00:00Z", candidatesCount: 1 });
    expect(voteStatus(late, ctx)).toMatchObject({ tone: "plan", canLaunch: true });
    expect(voteStatus(late, ctx).text).toBe("À lancer · moins de deux candidats entrés");
    // Heure à venir, ou événement non publié : la date reste dite.
    expect(voteStatus({ ...late, opensAt: "2026-11-10T15:00:00Z" }, ctx).text).toBe("Prévu · aujourd'hui 16 h");
    expect(voteStatus(late, { ...ctx, published: false }).text).toMatch(/^Prévu · /);
  });

  it("prêt à lancer avec deux candidats entrés ; sinon la raison est dite, jamais un bouton muet", () => {
    expect(voteStatus(item(), ctx)).toMatchObject({ tone: "ready", canLaunch: true, launchBlocked: null });
    expect(voteStatus(item(), ctx).text).toBe("Prêt à lancer · 5 voitures · 10 min");
    const few = voteStatus(item({ candidatesCount: 1 }), ctx);
    expect(few).toMatchObject({ tone: "plan", canLaunch: true });
    expect(few.launchBlocked).toMatch(/deux candidats/);
    const draftEvent = voteStatus(item(), { ...ctx, published: false });
    expect(draftEvent.launchBlocked).toMatch(/publication/);
  });

  it("« dès les premières entrées » s'ouvre seul : pas de bouton ; clos : le total", () => {
    expect(voteStatus(item({ openMode: "first_entry", candidateMode: "all" }), ctx)).toMatchObject({
      text: "Prévu · dès les premières entrées",
      canLaunch: false,
    });
    expect(voteStatus(item({ state: "closed", total: 21 }), ctx)).toMatchObject({
      tone: "closed",
      text: "Clos · 21 voix",
    });
  });

  it("le staff voit les états sans bouton", () => {
    const staff = { ...ctx, canWrite: false };
    expect(voteStatus(item(), staff)).toMatchObject({ canLaunch: false, canClose: false, launchBlocked: null });
    expect(voteStatus(item({ state: "open" }), staff).canClose).toBe(false);
  });
});

describe("brouillon d'un vote", () => {
  const ok = (over = {}) => ({ ...emptyVoteDraft(), title: "Plus belle japonaise", ...over });

  it("un modèle règle le titre et les candidats ; « à la main » passe l'ouverture à « Je le lance moi-même »", () => {
    const d = voteDraftWithTemplate(emptyVoteDraft(), {
      title: "Concours de rupteur",
      candidateMode: "hand",
      candidateFilter: null,
    });
    expect(d).toMatchObject({ title: "Concours de rupteur", mode: "hand", openMode: "manual" });
    const jp = voteDraftWithTemplate(emptyVoteDraft(), {
      title: "Plus belle japonaise",
      candidateMode: "origins",
      candidateFilter: { countries: ["JP"] },
    });
    expect(jp).toMatchObject({ mode: "origins", countries: ["JP"], openMode: "first_entry" });
    expect(voteDraftWithMode(jp, "hand").openMode).toBe("manual");
    expect(voteDraftWithMode({ ...jp, openMode: "at" }, "hand").openMode).toBe("at");
  });

  it("refuse un titre vide, une origine sans choix, une zone sans zone, « à la main » au premier pointage", () => {
    const c = { now: NOW };
    expect(voteDraftProblem(emptyVoteDraft(), c)).toMatch(/titre/);
    expect(voteDraftProblem(ok({ mode: "origins" }), c)).toMatch(/origine/);
    expect(voteDraftProblem(ok({ mode: "origins", countries: ["JP"] }), c)).toBeNull();
    expect(voteDraftProblem(ok({ mode: "origins", makeIds: ["m1"] }), c)).toBeNull();
    expect(voteDraftProblem(ok({ mode: "zone" }), c)).toMatch(/zone/);
    expect(voteDraftProblem(ok({ mode: "hand", openMode: "first_entry" }), c)).toMatch(/à la main/);
    expect(voteDraftProblem(ok({ mode: "hand", openMode: "manual" }), c)).toBeNull();
  });

  it("l'heure fixée est à venir, avant la fin de l'événement ; la durée au choix est bornée", () => {
    const end = new Date("2026-11-10T20:00:00Z");
    const c = { now: NOW, eventEndsAt: end };
    expect(voteDraftProblem(ok({ openMode: "at", opensAt: "" }), c)).toMatch(/heure/);
    expect(voteDraftProblem(ok({ openMode: "at", opensAt: "2026-11-10T12:00" }), c)).toMatch(/heure/);
    expect(voteDraftProblem(ok({ openMode: "at", opensAt: "2026-11-10T15:00" }), c)).toBeNull();
    expect(voteDraftProblem(ok({ openMode: "at", opensAt: "2026-11-10T22:00" }), c)).toMatch(/heure/);
    expect(voteDraftProblem(ok({ duration: "custom", customMinutes: "0" }), c)).toMatch(/durée/);
    expect(voteDraftProblem(ok({ duration: "custom", customMinutes: "20000" }), c)).toMatch(/durée/);
    expect(voteDraftProblem(ok({ duration: "custom", customMinutes: "45" }), c)).toBeNull();
    expect(voteDraftDuration(ok({ duration: "60" }))).toBe(60);
    expect(voteDraftDuration(ok({ duration: "end" }))).toBeNull();
  });

  it("le corps envoyé à l'API : filtre selon le mode, heure en instant, durée en minutes", () => {
    expect(voteDraftBody(ok())).toEqual({
      title: "Plus belle japonaise",
      candidateMode: "all",
      candidateFilter: null,
      openMode: "first_entry",
      opensAt: null,
      durationMinutes: null,
    });
    expect(
      voteDraftBody(ok({ mode: "origins", countries: ["JP", "DE"], makeIds: ["m1"], duration: "30" })),
    ).toMatchObject({ candidateFilter: { countries: ["JP", "DE"], makeIds: ["m1"] }, durationMinutes: 30 });
    expect(voteDraftBody(ok({ mode: "zone", zoneId: "z1", countries: ["JP"] })).candidateFilter).toEqual({
      zoneId: "z1",
    });
    const at = voteDraftBody(ok({ openMode: "at", opensAt: "2026-11-14T16:00" }));
    expect(at.opensAt).toBe("2026-11-14T15:00:00.000Z");
    expect(voteDraftBody(ok({ openMode: "manual", opensAt: "2026-11-14T16:00" })).opensAt).toBeNull();
  });

  it("un vote existant se relit dans le formulaire", () => {
    const d = voteDraftOfItem(
      item({
        candidateMode: "origins",
        candidateFilter: { countries: ["JP"] },
        openMode: "at",
        opensAt: "2026-11-14T15:00:00Z",
        durationMinutes: 45,
      }),
    );
    expect(d).toMatchObject({
      mode: "origins",
      countries: ["JP"],
      openMode: "at",
      opensAt: "2026-11-14T16:00",
      duration: "custom",
      customMinutes: "45",
    });
    expect(voteDraftOfItem(item({ durationMinutes: 30 })).duration).toBe("30");
    expect(voteDraftOfItem(item({ durationMinutes: null })).duration).toBe("end");
  });
});

describe("lignes de l'étape", () => {
  const none = () => null;
  const names = (ids: string[]) => ids.map((i) => `Marque ${i}`);

  it("les candidats : tous, origines et marques, zone, à la main", () => {
    expect(voteCandidatesSummary(item({ candidateMode: "all" }), none, names)).toBe("Tous les véhicules entrés");
    expect(
      voteCandidatesSummary(
        item({ candidateMode: "origins", candidateFilter: { countries: ["JP", "DE"] } }),
        none,
        names,
      ),
    ).toBe("Japonaises, allemandes");
    expect(
      voteCandidatesSummary(
        item({ candidateMode: "origins", candidateFilter: { countries: ["JP"], makeIds: ["7"] } }),
        none,
        names,
      ),
    ).toBe("Japonaises et Marque 7");
    expect(
      voteCandidatesSummary(item({ candidateMode: "zone", candidateFilter: { zoneId: "z" } }), () => "JDM", names),
    ).toBe("Zone JDM");
    expect(voteCandidatesSummary(item({ handCandidates: [] }), none, names)).toBe("Aucune voiture choisie");
  });

  it("la ligne de réglages d'un vote", () => {
    const v = item({
      candidateMode: "origins",
      candidateFilter: { countries: ["JP"] },
      openMode: "at",
      opensAt: "2026-11-14T11:00:00Z",
      durationMinutes: null,
    });
    expect(voteConfigLine(v, NOW, none, names)).toBe("Japonaises · samedi 12 h · jusqu'à la fin de l'événement");
    expect(voteConfigLine(item(), NOW, none, names)).toBe("Aucune voiture choisie · je le lance moi-même · 10 min");
  });
});

describe("voteScanOutcome (annonce après un scan)", () => {
  const candidate = (applicationId: string, vehicleLabel: string) => ({
    applicationId,
    vehicleLabel,
    pseudo: "x",
    photoUrl: null,
    eligible: true,
    entered: true,
    source: "scan" as const,
  });
  const added = (over: Partial<VoteCandidateAdded>): VoteCandidateAdded => ({
    ...item(),
    handCandidates: [candidate("a1", "Honda S2000"), candidate("a2", "Alfa Romeo 147")],
    addedApplicationId: "a1",
    added: true,
    ...over,
  });

  it("nomme la voiture du QR lu, pas la dernière scannée de la liste", () => {
    expect(voteScanOutcome(added({ addedApplicationId: "a1" }))).toEqual({
      label: "Honda S2000",
      count: 2,
      already: false,
    });
    expect(voteScanOutcome(added({ addedApplicationId: "a2" }))).toEqual({
      label: "Alfa Romeo 147",
      count: 2,
      already: false,
    });
  });

  it("un doublon est annoncé « déjà candidate » avec la bonne voiture", () => {
    expect(voteScanOutcome(added({ addedApplicationId: "a1", added: false }))).toEqual({
      label: "Honda S2000",
      count: 2,
      already: true,
    });
  });

  it("l'écran du scan : deux voitures de suite, puis un doublon, chacune annoncée sous son nom", () => {
    const first = added({ addedApplicationId: "a1", handCandidates: [candidate("a1", "Honda S2000")] });
    const second = added({ addedApplicationId: "a2" });
    const dup = added({ addedApplicationId: "a1", added: false });
    expect([first, second, dup].map((r) => voteScanMessage(voteScanOutcome(r)))).toEqual([
      "Honda S2000 · ajoutée · 1 au total",
      "Alfa Romeo 147 · ajoutée · 2 au total",
      "Honda S2000 · déjà candidate",
    ]);
  });
});

describe("recherche d'une voiture à ajouter (plus de 12 correspondances)", () => {
  const page = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ id: `a${from + i}` }));
  const taken = new Set(page(0, 12).map((h) => h.id));

  it("12 premières déjà choisies et une 13e à la page suivante : jamais « aucune voiture » avant la dernière page", () => {
    const first = voteSearchView({ items: page(0, 12), next: "c1", loading: false }, taken);
    expect(first).toMatchObject({ results: [], needMore: true, showNone: false, canMore: true });
    const loading = voteSearchView({ items: page(0, 12), next: "c1", loading: true }, taken);
    expect(loading).toMatchObject({ needMore: false, showNone: false });
    const second = voteSearchView({ items: page(0, 13), next: null, loading: false }, taken);
    expect(second).toMatchObject({ results: [{ id: "a12" }], needMore: false, showNone: false, canMore: false });
  });

  it("« aucune voiture » seulement quand la dernière page est lue et que tout est déjà choisi", () => {
    expect(voteSearchView({ items: page(0, 12), next: null, loading: false }, taken).showNone).toBe(true);
    expect(voteSearchView({ items: null, next: null, loading: false }, taken)).toMatchObject({ showNone: false });
  });
});

describe("données gardées après une coupure", () => {
  it("compte les minutes depuis la dernière lecture réussie", () => {
    expect(voteStaleMinutes(1_000, 1_000 + 30_000)).toBe(0);
    expect(voteStaleMinutes(1_000, 1_000 + 3 * 60_000 + 5_000)).toBe(3);
    expect(voteStaleMinutes(5_000, 1_000)).toBe(0);
  });
});
