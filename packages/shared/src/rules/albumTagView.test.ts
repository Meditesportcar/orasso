import { afterEach, describe, expect, it, vi } from "vitest";

import { albumTagLabels as L } from "../labels/albumTags.fr";
import type { Taggable } from "../schemas/albumTags";
import {
  albumViewerRoleOf,
  appendTaggablePage,
  createMyPhotosReads,
  createOperationGate,
  createTaggablePicker,
  emptyPhotosState,
  liveStoryAt,
  mentionsSummary,
  myPhotoTaggedBy,
  nextLiveStoryExpiry,
  readIsQuiet,
  reviewButtonsOf,
  showPeopleTab,
  taggedByText,
  whoLabelOf,
} from "./albumTagView";

const car = { vehicleId: "v", label: "Toyota GR Supra" } as never;
const me = { userId: "u", pseudo: "Damien_66", avatarUrl: null, mine: true };

describe("albumViewerRoleOf", () => {
  it("le média auteur est toujours « media »", () => {
    expect(albumViewerRoleOf({ mine: true, taggable: null })).toBe("media");
  });
  it("sans plateau lu : un membre", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: null })).toBe("member");
  });
  it("l'organisateur", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "organizer", vehicles: [car], people: [] } })).toBe(
      "organizer",
    );
  });
  it("un passionné avec une voiture présente peut dire « C'est ma voiture »", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [car], people: [] } })).toBe("tagged");
  });
  it("un passionné dont seul le pseudo est identifiable", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [], people: [me] } })).toBe("tagged");
  });
  it("sans voiture ni pseudo identifiable : un membre (le bouton est absent)", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [], people: [] } })).toBe("member");
  });
});

describe("whoLabelOf", () => {
  it("les trois phrases de la maquette", () => {
    expect(whoLabelOf("media")).toBe("média auteur de l'album");
    expect(whoLabelOf("organizer")).toBe("organisateur de l'événement");
    expect(whoLabelOf("tagged")).toBe("propriétaire d'une voiture présente");
    expect(whoLabelOf("member")).toBeNull();
  });
});

describe("taggedByText", () => {
  it("moi quand j'ai posé l'identification, le média ou l'organisateur sinon", () => {
    expect(taggedByText({ taggedAs: "owner", mine: true, removeAs: "withdraw" }, "tagged", "Sud Cars")).toBe(
      L.identifiedByYou,
    );
    expect(taggedByText({ taggedAs: "media", mine: true, removeAs: "not_mine" }, "tagged", "Sud Cars")).toBe(
      "identifiée par Sud Cars",
    );
    expect(taggedByText({ taggedAs: "media", mine: false, removeAs: "tagger" }, "media", "Sud Cars")).toBe(
      L.identifiedByYou,
    );
    expect(taggedByText({ taggedAs: "organizer", mine: false, removeAs: null }, "member", "Sud Cars")).toBe(
      "identifiée par l'organisateur",
    );
  });
});

describe("myPhotoTaggedBy", () => {
  it("les trois cas de « Tes photos »", () => {
    expect(myPhotoTaggedBy("media", "Sud Cars")).toBe("Identifiée par Sud Cars");
    expect(myPhotoTaggedBy("me", "Sud Cars")).toBe("Identifiée par toi");
    expect(myPhotoTaggedBy("organizer", "Sud Cars")).toBe("Identifiée par l'organisateur");
  });
});

describe("mentionsSummary", () => {
  it("la voiture et le média, accord au pluriel", () => {
    expect(mentionsSummary([{ count: 6, mediaName: "Objectif 66" }], "Toyota GR Supra")?.line).toBe(
      "6 photos de ta Toyota GR Supra · Objectif 66",
    );
    expect(mentionsSummary([{ count: 1, mediaName: "Objectif 66" }], "Toyota GR Supra")?.line).toBe(
      "1 photo de ta Toyota GR Supra · Objectif 66",
    );
  });
  it("sans voiture : « où tu es identifié » ; plusieurs albums : la somme, les médias une fois", () => {
    const s = mentionsSummary(
      [
        { count: 2, mediaName: "Objectif 66" },
        { count: 3, mediaName: "Objectif 66" },
      ],
      null,
    );
    expect(s?.count).toBe(5);
    expect(s?.line).toBe("5 photos où tu es identifié · Objectif 66");
  });
  it("rien sans photo", () => {
    expect(mentionsSummary(undefined, "x")).toBeNull();
    expect(mentionsSummary([], "x")).toBeNull();
  });
});

describe("appendTaggablePage (« Voir plus » au-delà de 60 voitures)", () => {
  const car = (i: number) => ({ vehicleId: `v${i}`, label: `Voiture ${i}` }) as never;
  const page = (from: number, n: number, nextCursor: number | null) =>
    ({
      role: "media",
      vehicles: Array.from({ length: n }, (_, i) => car(from + i)),
      people: [],
      categories: [],
      fallback: false,
      nextCursor,
    }) as never;
  it("130 voitures en trois pages : toutes, une fois chacune, le curseur de la dernière page", () => {
    const a = appendTaggablePage(page(0, 60, 60), page(60, 60, 120));
    const b = appendTaggablePage(a, page(120, 10, null));
    expect(b.vehicles).toHaveLength(130);
    expect(new Set(b.vehicles.map((v) => v.vehicleId)).size).toBe(130);
    expect(b.nextCursor).toBeNull();
    expect(a.nextCursor).toBe(120);
  });
  it("une voiture déjà lue n'est pas doublée", () => {
    expect(appendTaggablePage(page(0, 3, 3), page(2, 3, null)).vehicles).toHaveLength(5);
  });
});

describe("showPeopleTab", () => {
  it("après deux caractères, ou dès que l'API rend « moi » sans recherche", () => {
    expect(showPeopleTab(false, 0)).toBe(false);
    expect(showPeopleTab(true, 0)).toBe(true);
    expect(showPeopleTab(false, 1)).toBe(true);
  });
});

describe("createOperationGate", () => {
  it("réponses dans l'ordre inverse : seule la dernière opération démarrée est appliquée", () => {
    const gate = createOperationGate();
    const first = gate.start();
    const second = gate.start();
    // La seconde répond d'abord, la première après : la première est périmée.
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });
  it("une invalidation (changement d'album, fermeture, perte de focus) périme l'opération en cours, sans reprise au retour", () => {
    const gate = createOperationGate();
    const op = gate.start();
    gate.invalidate();
    expect(op()).toBe(false);
    gate.invalidate();
    expect(op()).toBe(false);
  });
});

describe("createTaggablePicker (liste + « Voir plus »)", () => {
  const taggable = (from: number, n: number, nextCursor: number | null) =>
    ({
      role: "media",
      vehicles: Array.from({ length: n }, (_, i) => ({ vehicleId: `v${from + i}`, label: `V${from + i}` })),
      people: [],
      categories: [],
      fallback: false,
      nextCursor,
    }) as never as Taggable;
  const ids = (t: Taggable | null) => t?.vehicles.map((v) => v.vehicleId) ?? [];

  it("« Coupé » puis « Voir plus » : la liste fraîche est gardée, la page de l'ancien filtre est jetée", () => {
    const ctrl = createTaggablePicker();
    const all = ctrl.startList();
    ctrl.applyList(all, {}, taggable(0, 3, 3));
    const more = ctrl.startMore();
    expect(more?.query).toEqual({});
    expect(more?.cursor).toBe(3);
    // La puce « Coupé » démarre pendant la page : la liste fraîche répond d'abord, la page de « Toutes » arrive ensuite.
    const coupe = ctrl.startList();
    expect(ctrl.state().canMore).toBe(false);
    ctrl.applyList(coupe, { category: "coupe" }, taggable(100, 2, null));
    expect(ctrl.applyMore(more?.live as () => boolean, taggable(3, 3, null))).toBeNull();
    expect(ids(ctrl.state().data)).toEqual(["v100", "v101"]);
    expect(ctrl.state().loadingMore).toBe(false);
  });

  it("« Voir plus » pendant une lecture de liste est refusé ; la page lit avec les paramètres du résultat montré", () => {
    const ctrl = createTaggablePicker();
    ctrl.applyList(ctrl.startList(), { q: "ab", category: "gt" }, taggable(0, 3, 3));
    ctrl.startList();
    expect(ctrl.startMore()).toBeNull();
  });

  it("une page à la fois, pages suivies (curseur de la dernière réponse) ; réouverture pendant une page : page jetée", () => {
    const ctrl = createTaggablePicker();
    ctrl.applyList(ctrl.startList(), { q: "ab" }, taggable(0, 3, 3));
    const first = ctrl.startMore();
    expect(first?.query).toEqual({ q: "ab" });
    // Une seconde page ne part pas tant que la première est en route.
    expect(ctrl.startMore()).toBeNull();
    const state = ctrl.applyMore(first?.live as () => boolean, taggable(3, 3, 6));
    expect(ids(state?.data ?? null)).toEqual(["v0", "v1", "v2", "v3", "v4", "v5"]);
    expect(state?.data?.nextCursor).toBe(6);
    // Réouverture pendant une page : elle est périmée, jamais ajoutée au résultat suivant.
    const second = ctrl.startMore();
    ctrl.reset();
    ctrl.applyList(ctrl.startList(), {}, taggable(50, 1, null));
    expect(ctrl.applyMore(second?.live as () => boolean, taggable(6, 3, null))).toBeNull();
    expect(ids(ctrl.state().data)).toEqual(["v50"]);
  });

  it("échec de la lecture d'un autre filtre : « Voir plus » est masqué, jamais lu avec l'ancien curseur", () => {
    const ctrl = createTaggablePicker();
    ctrl.applyList(ctrl.startList(), {}, taggable(0, 3, 3));
    expect(ctrl.state().hasMore).toBe(true);
    const coupe = ctrl.startList();
    const failed = ctrl.failList(coupe, "Pas de connexion");
    expect(failed?.loadError).toBe("Pas de connexion");
    expect(failed?.hasMore).toBe(false);
    expect(ctrl.startMore()).toBeNull();
    // Le filtre suivant se lit : l'erreur disparaît, « Voir plus » revient avec son résultat.
    ctrl.applyList(ctrl.startList(), { category: "gt" }, taggable(10, 3, 13));
    expect(ctrl.state().loadError).toBeNull();
    expect(ctrl.startMore()?.query).toEqual({ category: "gt" });
  });

  it("fermeture puis réouverture : plus rien du plateau précédent, les réponses en route sont jetées", () => {
    const ctrl = createTaggablePicker();
    const l = ctrl.startList();
    ctrl.reset();
    expect(ctrl.applyList(l, {}, taggable(0, 3, null))).toBeNull();
    expect(ctrl.state().data).toBeNull();
    const after = ctrl.startList();
    expect(ctrl.applyList(after, {}, taggable(1, 1, null))?.data?.vehicles).toHaveLength(1);
  });
});

describe("createTaggablePicker : échec d'une page et invalidation", () => {
  const t = (from: number, next: number | null) =>
    ({
      role: "media",
      vehicles: [{ vehicleId: `v${from}`, label: "V" }],
      people: [],
      categories: [],
      fallback: false,
      nextCursor: next,
    }) as never as Taggable;
  it("failMore remet loadingMore à faux : « Voir plus » est de nouveau possible, avec le même curseur", () => {
    const ctrl = createTaggablePicker();
    ctrl.applyList(ctrl.startList(), {}, t(0, 1));
    const first = ctrl.startMore();
    expect(ctrl.state().loadingMore).toBe(true);
    const failed = ctrl.failMore(first?.live as () => boolean);
    expect(failed?.loadingMore).toBe(false);
    expect(failed?.canMore).toBe(true);
    expect(ctrl.startMore()?.cursor).toBe(1);
  });
  it("invalidate : les réponses en route (liste et page) sont jetées, l'état déjà lu est gardé", () => {
    const ctrl = createTaggablePicker();
    ctrl.applyList(ctrl.startList(), {}, t(0, 1));
    const page = ctrl.startMore();
    const list = ctrl.startList();
    ctrl.invalidate();
    expect(ctrl.applyList(list, {}, t(9, null))).toBeNull();
    expect(ctrl.applyMore(page?.live as () => boolean, t(1, null))).toBeNull();
    expect(ctrl.state().data?.vehicles[0]?.vehicleId).toBe("v0");
  });
});

describe("liveStoryAt / nextLiveStoryExpiry (« Déjà en story » expire)", () => {
  const live = (iso: string) => ({ audience: "public" as const, expiresAt: iso });
  it("en ligne tant que l'expiration n'est pas passée, plus ensuite", () => {
    const l = live("2026-11-14T10:00:00Z");
    expect(liveStoryAt(l, Date.parse("2026-11-14T09:59:59Z"))).toBe(l);
    expect(liveStoryAt(l, Date.parse("2026-11-14T10:00:00Z"))).toBeNull();
    expect(liveStoryAt(null, 0)).toBeNull();
  });
  it("le prochain instant d'expiration est celui de la première story encore en ligne", () => {
    const now = Date.parse("2026-11-14T09:00:00Z");
    const photos = [
      { liveStory: live("2026-11-14T08:00:00Z") },
      { liveStory: live("2026-11-14T12:00:00Z") },
      { liveStory: live("2026-11-14T10:00:00Z") },
      { liveStory: null },
    ];
    expect(nextLiveStoryExpiry(photos, now)).toBe(Date.parse("2026-11-14T10:00:00Z"));
    expect(nextLiveStoryExpiry([{ liveStory: null }], now)).toBeNull();
  });
});

describe("readIsQuiet (relecture de routine concurrente d'un retrait)", () => {
  it("la minuterie d'expiration ne se tait que sans retrait en attente : sinon l'échec doit se voir", () => {
    expect(readIsQuiet(true, 0)).toBe(true);
    expect(readIsQuiet(true, 1)).toBe(false);
    expect(readIsQuiet(false, 0)).toBe(false);
  });
});

describe("createMyPhotosReads (relectures de « Tes photos », réponses contrôlées)", () => {
  afterEach(() => vi.useRealTimers());
  type V = { photos: { id: string; liveStory: { expiresAt: string } | null }[] };
  const view = (...ids: string[]): V => ({ photos: ids.map((id) => ({ id, liveStory: null })) });

  it("minuterie d'expiration et relecture après un retrait : la minuterie n'est pas silencieuse, elle périme la relecture du retrait, et son échec se voit", () => {
    vi.useFakeTimers();
    const reads = createMyPhotosReads<V>();
    reads.removeTag("t1");
    const afterRemove = reads.start(false);
    let timerRead: ReturnType<typeof reads.start> | null = null;
    setTimeout(() => {
      timerRead = reads.start(true);
    }, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(timerRead).not.toBeNull();
    const tr = timerRead as unknown as ReturnType<typeof reads.start>;
    // Un retrait attend : la relecture de minuterie n'est pas silencieuse.
    expect(tr.quiet).toBe(false);
    // La relecture du retrait, périmée, est jetée ; l'échec de la minuterie s'affiche (jamais un faux « aucune photo »).
    expect(reads.ok(afterRemove, view("a"))).toBeNull();
    const failed = reads.fail(tr, "Panne");
    expect(failed?.error).toBe("Panne");
    expect(failed?.removed.has("t1")).toBe(true);
    expect(emptyPhotosState(failed?.removed.size ?? 0, 0, failed?.error !== null)).toBe("error");
    // « Réessayer » réussit : les retraits sont levés, l'erreur disparaît.
    const retry = reads.start(false);
    const ok = reads.ok(retry, view("a"));
    expect(ok?.error).toBeNull();
    expect(ok?.removed.size).toBe(0);
    expect(ok?.fresh?.photos).toHaveLength(1);
  });

  it("sans retrait en attente, la relecture de minuterie est silencieuse : son échec ne dit rien", () => {
    const reads = createMyPhotosReads<V>();
    const read = reads.start(true);
    expect(read.quiet).toBe(true);
    expect(reads.fail(read, "Panne")?.error).toBeNull();
  });

  it("deux relectures : seule la dernière lancée s'applique, la plus ancienne arrivée après est jetée", () => {
    const reads = createMyPhotosReads<V>();
    reads.removeTag("t1");
    const first = reads.start(false);
    const second = reads.start(false);
    expect(reads.ok(second, view("fresh"))?.fresh?.photos[0]?.id).toBe("fresh");
    expect(reads.ok(first, view("old"))).toBeNull();
    expect(reads.state().fresh?.photos[0]?.id).toBe("fresh");
  });

  it("un nouveau chargement de la page périme la relecture en route et en demande une autre si un retrait attend", () => {
    const reads = createMyPhotosReads<V>();
    reads.removeTag("t1");
    const inFlight = reads.start(false);
    const loaded = reads.newLoaded();
    expect(loaded.reread).toBe(true);
    expect(reads.ok(inFlight, view("old"))).toBeNull();
    expect(createMyPhotosReads<V>().newLoaded().reread).toBe(false);
  });

  it("réponse reçue après l'expiration d'une story : « Déjà en story » n'est plus montré au rendu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-14T09:59:00Z"));
    const reads = createMyPhotosReads<V>();
    const read = reads.start(false);
    // La réponse part avec une story qui expire à 10:00 ; elle n'arrive qu'à 10:01.
    const payload: V = { photos: [{ id: "a", liveStory: { expiresAt: "2026-11-14T10:00:00Z" } }] };
    vi.setSystemTime(Date.parse("2026-11-14T10:01:00Z"));
    const state = reads.ok(read, payload);
    expect(liveStoryAt(state?.fresh?.photos[0]?.liveStory, Date.now())).toBeNull();
    expect(nextLiveStoryExpiry(state?.fresh?.photos ?? [], Date.now())).toBeNull();
  });
});

describe("emptyPhotosState", () => {
  it("liste visible : rien de plus ; vide avec retrait en attente : « Chargement… » ; avec erreur : l'erreur ; sinon « aucune photo »", () => {
    expect(emptyPhotosState(1, 2, false)).toBe("list");
    expect(emptyPhotosState(1, 0, false)).toBe("loading");
    expect(emptyPhotosState(1, 0, true)).toBe("error");
    expect(emptyPhotosState(0, 0, false)).toBe("empty");
  });
});

describe("reviewButtonsOf (souvenir à plusieurs albums)", () => {
  it("un album : « Revoir mes photos » ; deux albums : deux boutons distincts, chacun vers son album", () => {
    expect(reviewButtonsOf([{ albumId: "a1", mediaName: "Sud Cars" }])).toEqual([
      { albumId: "a1", label: "Revoir mes photos" },
    ]);
    const two = reviewButtonsOf([
      { albumId: "a1", mediaName: "Sud Cars" },
      { albumId: "a2", mediaName: "Sud Cars" },
    ]);
    expect(two.map((b) => b.albumId)).toEqual(["a1", "a2"]);
    expect(new Set(two.map((b) => b.label)).size).toBe(2);
    expect(two[0]?.label).toBe("Revoir mes photos · Sud Cars (1)");
  });
  it("rien sans album", () => {
    expect(reviewButtonsOf(undefined)).toEqual([]);
  });
});
