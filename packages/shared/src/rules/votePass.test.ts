import { afterEach, describe, expect, it, vi } from "vitest";

import type { VoteView } from "../schemas/votes";
import {
  myRankIn,
  openVotesIn,
  rankingBarPercent,
  rankingHiddenLine,
  voteBlockedLine,
  voteIsOver,
  voteMinutesLeft,
  voteResultCard,
  voteRow,
  voteScreenMode,
  voteWatchDeadline,
} from "./votePass";
import { watchClosing } from "./voteScreen";

// Mardi 10 novembre 2026, 13 h 14 à Paris.
const NOW = new Date("2026-11-10T12:14:00Z");

/** Les espaces insécables des heures (« 23 h ») se comparent comme des espaces. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

const view = (over: Partial<VoteView> = {}): VoteView => ({
  id: "v1",
  eventId: "e1",
  title: "Plus belle japonaise",
  kind: "theme",
  state: "open",
  opensAt: "2026-11-10T09:00:00Z",
  closesAt: "2026-11-11T22:00:00Z",
  candidatesCount: 6,
  total: 4,
  myVote: null,
  votedAt: null,
  canVote: true,
  reason: null,
  ranking: null,
  rankingHiddenReason: "vote_first",
  rareStamp: false,
  ownApplicationIds: ["mine"],
  checkedInAt: "2026-11-10T08:12:00Z",
  settled: false,
  ...over,
});

const entry = (applicationId: string, vehicleLabel: string, pseudo: string, votes: number, rank: number) => ({
  applicationId,
  vehicleLabel,
  pseudo,
  photoUrl: null,
  votes,
  rank,
});

describe("la ligne d'un vote dans la liste", () => {
  it("ouvert, je peux voter : « Ouvert · 6 voitures · ferme demain à 23 h »", () => {
    const row = voteRow(view(), NOW);
    expect(row).toMatchObject({ tone: "open", chip: "Voter", muted: false, hot: false });
    expect(plain(row.detail)).toBe("Ouvert · 6 voitures · ferme demain à 23 h");
  });

  it("se ferme dans moins d'une heure : « 8 min restantes », mise en avant", () => {
    const row = voteRow(view({ closesAt: "2026-11-10T12:22:00Z", candidatesCount: 5 }), NOW);
    expect(row).toMatchObject({ tone: "soon", chip: "Voter", hot: true });
    expect(plain(row.detail)).toBe("8 min restantes · 5 voitures");
  });

  it("voté : « Voté », avec ma voiture quand le classement servi la montre", () => {
    expect(voteRow(view({ myVote: "x" }), NOW)).toMatchObject({ tone: "voted", chip: "Voté", chipIcon: "check" });
    expect(plain(voteRow(view({ myVote: "x" }), NOW).detail)).toBe("Ta voix est enregistrée · ferme demain à 23 h");
    const ranked = view({ myVote: "x", ranking: [entry("x", "Mazda RX-7 FD", "Lea_11", 2, 1)] });
    expect(plain(voteRow(ranked, NOW).detail)).toBe("Ta voix : Mazda RX-7 FD · ferme demain à 23 h");
  });

  it("à venir : grisée, avec l'heure d'ouverture ou ce qui manque", () => {
    const timed = voteRow(view({ state: "upcoming", opensAt: "2026-11-10T14:00:00Z", candidatesCount: 5 }), NOW);
    expect(timed).toMatchObject({ tone: "upcoming", chip: "À venir", muted: true });
    expect(plain(timed.detail)).toBe("Ouvre à 15 h · 5 voitures");
    expect(plain(voteRow(view({ state: "upcoming", opensAt: null, candidatesCount: 1 }), NOW).detail)).toBe(
      "Ouvre dès deux voitures entrées · 1 voiture",
    );
    expect(plain(voteRow(view({ state: "upcoming", opensAt: null, candidatesCount: 0 }), NOW).detail)).toBe(
      "Ouvre dès deux voitures entrées",
    );
    expect(plain(voteRow(view({ state: "upcoming", opensAt: null, candidatesCount: 3 }), NOW).detail)).toBe(
      "Ouverture à venir · 3 voitures",
    );
  });

  it("clos : « Clos · voir le classement »", () => {
    const row = voteRow(view({ state: "closed", ranking: [] }), NOW);
    expect(row).toMatchObject({ tone: "closed", muted: false, detail: "Clos · voir le classement" });
  });

  it("je ne peux pas voter : dit ce qu'il manque (entrer, ou valider sa présence quand on est visiteur)", () => {
    const entered = voteRow(view({ canVote: false, reason: "not_checked_in" }), NOW);
    expect(entered.tone).toBe("blocked");
    expect(entered.detail).toContain("Entre sur l'événement pour voter");
    const visitor = voteRow(view({ canVote: false, reason: "not_checked_in", ownApplicationIds: [] }), NOW);
    expect(visitor.detail).toContain("Valide ta présence pour voter");
    expect(voteBlockedLine({ ownApplicationIds: [] })).toBe("Valide ta présence pour voter");
  });

  it("minutes restantes : arrondi vers le haut, jamais négatif", () => {
    expect(voteMinutesLeft("2026-11-10T12:14:30Z", NOW)).toBe(1);
    expect(voteMinutesLeft("2026-11-10T12:00:00Z", NOW)).toBe(0);
  });

  it("compte les votes ouverts", () => {
    expect(openVotesIn([{ state: "open" }, { state: "upcoming" }, { state: "open" }, { state: "closed" }])).toBe(2);
  });
});

describe("la carte « Résultat »", () => {
  const ranking = [
    entry("a", "Toyota GR Supra", "Damien_66", 19, 1),
    entry("b", "Honda S2000 AP1", "Nina_34", 12, 2),
    entry("c", "Mazda RX-7 FD", "Lea_11", 9, 3),
    entry("d", "Toyota Supra Mk4", "Kenji_66", 7, 4),
  ];

  it("montre le podium d'un vote clos, trois lignes au plus", () => {
    const card = voteResultCard({ state: "closed", ranking, candidatesCount: 4, total: 47 });
    expect(card?.map((r) => [r.rank, r.label, r.votes])).toEqual([
      [1, "Toyota GR Supra", 19],
      [2, "Honda S2000 AP1", 12],
      [3, "Mazda RX-7 FD", 9],
    ]);
  });

  it("rien sans podium (moins de deux voitures ou de trois voix), ni avant la clôture, ni sans classement servi", () => {
    expect(voteResultCard({ state: "closed", ranking, candidatesCount: 1, total: 47 })).toBeNull();
    expect(voteResultCard({ state: "closed", ranking, candidatesCount: 4, total: 2 })).toBeNull();
    expect(voteResultCard({ state: "open", ranking, candidatesCount: 4, total: 47 })).toBeNull();
    expect(voteResultCard({ state: "closed", ranking: null, candidatesCount: 4, total: 47 })).toBeNull();
  });
});

describe("l'écran d'un vote d'après la réponse de l'API", () => {
  it("la grille se touche tant que je n'ai pas voté, puis ma voix et le classement ; « Changer » rouvre la grille", () => {
    expect(voteScreenMode(null, false)).toBe("loading");
    expect(voteScreenMode(view(), false)).toBe("choose");
    expect(voteScreenMode(view({ myVote: "x", ranking: [] }), false)).toBe("voted");
    expect(voteScreenMode(view({ myVote: "x", ranking: [] }), true)).toBe("choose");
  });

  it("qui ne peut pas voter : la grille sans pouvoir la toucher ; vote à venir ; vote clos", () => {
    expect(voteScreenMode(view({ canVote: false, reason: "not_checked_in" }), false)).toBe("blocked");
    expect(voteScreenMode(view({ state: "upcoming", canVote: false }), false)).toBe("upcoming");
    expect(voteScreenMode(view({ state: "closed", ranking: [] }), false)).toBe("closed");
  });

  it("la phrase du classement caché dépend de la raison servie par l'API", () => {
    expect(rankingHiddenLine({ rankingHiddenReason: "vote_first" })).toBe("Le classement s'affiche après ton vote.");
    expect(rankingHiddenLine({ rankingHiddenReason: "not_closed" })).toBe(
      "Le classement s'affiche à la clôture du vote.",
    );
    expect(rankingHiddenLine({ rankingHiddenReason: null })).toBe("Le classement s'affiche à la clôture du vote.");
  });

  it("barre du classement et ma place", () => {
    expect(rankingBarPercent(3, 3)).toBe(100);
    expect(rankingBarPercent(0, 3)).toBe(0);
    expect(rankingBarPercent(1, 100)).toBe(4);
    const v = view({ ranking: [entry("mine", "Nissan 200SX", "Damien_66", 1, 2)] });
    expect(myRankIn(v)).toEqual({ rank: 2, of: 6 });
    expect(myRankIn(view())).toBeNull();
  });
});

describe("surveillance de la clôture (constat du 09/11 : ouverture refusée, puis acceptée)", () => {
  afterEach(() => vi.useRealTimers());

  it("l'échéance se surveille tant que le vote n'est pas fini, ouvert ou pas", () => {
    const end = "2026-11-10T13:00:00Z";
    expect(voteWatchDeadline(view({ state: "upcoming", closesAt: end }))?.toISOString()).toBe(
      "2026-11-10T13:00:00.000Z",
    );
    expect(voteWatchDeadline(view({ state: "open", closesAt: end }))?.toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(voteWatchDeadline(view({ state: "closed", closesAt: end }))).toBeNull();
    expect(voteWatchDeadline(view({ state: "open", settled: true, closesAt: end }))).toBeNull();
    expect(voteWatchDeadline(null)).toBeNull();
    expect(voteIsOver(view({ state: "upcoming" }))).toBe(false);
    expect(voteIsOver(view({ state: "closed" }))).toBe(true);
  });

  it("ouverture refusée (un seul véhicule), deuxième pointage, clôture sans voix : l'écran relit à l'échéance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    const closesAt = "2026-11-10T12:10:00Z";
    // L'écran s'ouvre quand il manque un véhicule : le vote est prévu, jamais ouvert.
    const first = view({ state: "upcoming", canVote: false, reason: "vote_not_open", closesAt, candidatesCount: 1 });
    const server = { current: first };
    const reloads: string[] = [];
    const watch = watchClosing({
      deadline: voteWatchDeadline(first),
      now: () => new Date(Date.now()),
      reload: async () => {
        reloads.push(server.current.state);
        return voteIsOver(server.current);
      },
    });
    // Le deuxième pointage ouvre le vote : l'écran n'a rien à réarmer, la minuterie court déjà.
    server.current = view({ state: "open", closesAt, candidatesCount: 2, total: 0 });
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(reloads).toEqual([]);
    // L'heure de clôture passe sans une seule voix : le serveur dit « clos », l'écran l'apprend sans message.
    server.current = view({ state: "closed", closesAt, candidatesCount: 2, total: 0, ranking: [] });
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(reloads).toEqual(["closed"]);
    watch.stop();
  });

  it("l'API dit encore « ouvert » à l'échéance : l'écran réessaie jusqu'à la clôture confirmée", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    const closesAt = "2026-11-10T12:05:00Z";
    let state: VoteView["state"] = "open";
    let calls = 0;
    const watch = watchClosing({
      deadline: voteWatchDeadline(view({ closesAt })),
      now: () => new Date(Date.now()),
      reload: async () => {
        calls += 1;
        if (calls === 2) state = "closed";
        return voteIsOver(view({ state }));
      },
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(2);
    watch.stop();
  });
});
