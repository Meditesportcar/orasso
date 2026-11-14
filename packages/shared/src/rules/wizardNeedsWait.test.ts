import { describe, expect, it } from "vitest";
import {
  accountAfterAnnouncement,
  cancelIsAnnounced,
  decideClick,
  newTicket,
  nextEpoch,
  settleWait,
  type WaitedAction,
  waitCancelReason,
  waitIsStale,
} from "./wizardNeedsWait";

describe("clic pendant le chargement des missions (R9-assistant)", () => {
  it("missions chargées : le clic s'exécute tout de suite", () => {
    expect(decideClick("ok", null, true)).toBe("run");
  });

  it("missions en chargement : le clic est mis en attente, pas refusé", () => {
    expect(decideClick("loading", null, true)).toBe("wait");
  });

  it("une action qui n'a pas besoin des missions (création au temps 1) part sans attendre", () => {
    expect(decideClick("loading", null, false)).toBe("run");
  });

  it("lecture en échec : refus (message et « Recharger les missions »), jamais d'attente sans fin", () => {
    expect(decideClick("failed", null, true)).toBe("refuse");
  });

  it("double clic : le second, pendant l'attente, ne double rien", () => {
    const first: WaitedAction = "next";
    expect(decideClick("loading", null, true)).toBe("wait");
    expect(decideClick("loading", first, true)).toBe("ignore");
    expect(decideClick("loading", "publish", true)).toBe("ignore");
  });

  it("à l'arrivée des missions : le clic en attente part, une seule fois", () => {
    expect(settleWait("next", "loading")).toBe("keep");
    expect(settleWait("next", "ok")).toBe("run");
    // Le clic parti est vidé : plus rien à faire au changement d'état suivant.
    expect(settleWait(null, "ok")).toBe("none");
  });

  it("panne de lecture : le clic en attente est annulé (`fail`), jamais exécuté", () => {
    expect(settleWait("publish", "failed")).toBe("fail");
    expect(settleWait("save", "failed")).toBe("fail");
    expect(settleWait(null, "failed")).toBe("none");
  });
});

describe("l'attente est liée à l'étape, à la saisie et au compte vus au clic (tour 2)", () => {
  const seen = { step: 2, epoch: 0, account: "a", leaving: false };
  const ticket = newTicket("publish", seen);

  it("rien n'a changé : l'attente tient", () => {
    expect(waitIsStale(ticket, seen)).toBe(false);
  });

  it("changement d'étape (Retour, frise, restauration d'une étape) : annulée", () => {
    expect(waitIsStale(ticket, { ...seen, step: 1 })).toBe(true);
    expect(waitIsStale(ticket, { ...seen, step: 3 })).toBe(true);
  });

  it("saisie gardée restaurée, effacée ou recommencée : annulée", () => {
    expect(waitIsStale(ticket, { ...seen, epoch: 1 })).toBe(true);
  });

  it("sortie (fenêtre « Quitter l'assistant ? ») : annulée", () => {
    expect(waitIsStale(ticket, { ...seen, leaving: true })).toBe(true);
  });

  it("autre compte (annonce d'une autre fenêtre) : annulée", () => {
    expect(waitIsStale(ticket, { ...seen, account: "b" })).toBe(true);
    expect(waitIsStale(ticket, { ...seen, account: null })).toBe(true);
  });

  it("le compte suit les annonces des autres fenêtres, pas celles de la fenêtre elle-même", () => {
    expect(accountAfterAnnouncement("a", "b", false)).toBe("b");
    expect(accountAfterAnnouncement("a", null, false)).toBeNull();
    expect(accountAfterAnnouncement("a", "b", true)).toBe("a");
  });
});

describe("modification de la saisie pendant l'attente (tour 3)", () => {
  const seen = { step: 2, epoch: 4, account: "a", leaving: false };
  const ticket = newTicket("next", seen);

  it("une modification par la personne fait avancer `epoch` : l'attente est annulée", () => {
    expect(waitIsStale(ticket, { ...seen, epoch: seen.epoch + 1 })).toBe(true);
  });

  it("une fusion automatique (missions, valeur calculée) ne change pas `epoch` : l'attente tient", () => {
    expect(waitIsStale(ticket, seen)).toBe(false);
  });

  it("une annonce du MÊME compte par une autre fenêtre ne change pas le compte vu", () => {
    expect(accountAfterAnnouncement("a", "a", false)).toBe("a");
    expect(waitIsStale(ticket, { ...seen, account: accountAfterAnnouncement("a", "a", false) })).toBe(false);
  });
});

describe("l'étape est figée pendant l'attente (tour 4)", () => {
  const seen = { step: 1, epoch: 2, account: "a", leaving: false };
  const ticket = newTicket("publish", seen);

  it("sortie par un lien ordinaire ou la fermeture (`beforeunload`) ou perte de focus de l'écran (appli) : annulée", () => {
    // Les deux sorties posent `leaving` dans le contexte (appli : `quitting || blurred`).
    expect(waitIsStale(ticket, { ...seen, leaving: true })).toBe(true);
  });

  it("l'écran retrouve le focus : un nouveau billet est nécessaire, l'ancien reste annulé par le composant", () => {
    expect(waitIsStale(ticket, { ...seen, leaving: false })).toBe(false);
    expect(waitIsStale(newTicket("publish", { ...seen, leaving: false }), seen)).toBe(false);
  });

  it("seules la restauration, « Effacer » et « Recommencer » font avancer `epoch` : elles annulent, rien d'autre", () => {
    expect(waitIsStale(ticket, { ...seen, epoch: seen.epoch + 1 })).toBe(true);
    expect(waitIsStale(ticket, seen)).toBe(false);
  });
});

describe("pourquoi l'attente est annulée, et quand elle le dit (tour 5)", () => {
  const seen = { step: 1, epoch: 3, account: "a", leaving: false };
  const ticket = newTicket("next", seen);

  it("chaque cause donne sa raison, la sortie et le compte avant la saisie, la saisie avant l'étape", () => {
    expect(waitCancelReason(ticket, seen)).toBeNull();
    expect(waitCancelReason(ticket, { ...seen, leaving: true })).toBe("leaving");
    expect(waitCancelReason(ticket, { ...seen, account: "b" })).toBe("account");
    expect(waitCancelReason(ticket, { ...seen, step: 2 })).toBe("step");
    expect(waitCancelReason(ticket, { ...seen, epoch: 4 })).toBe("saisie");
    // Une restauration change la saisie et l'étape : la raison dite est la saisie.
    expect(waitCancelReason(ticket, { ...seen, epoch: 4, step: 2 })).toBe("saisie");
    expect(waitCancelReason(ticket, { ...seen, epoch: 4, leaving: true })).toBe("leaving");
  });

  it("seule une saisie changée annule en le disant", () => {
    expect(cancelIsAnnounced("saisie")).toBe(true);
    for (const r of ["leaving", "account", "step", null] as const) expect(cancelIsAnnounced(r)).toBe(false);
  });

  it("`epoch` n'avance que si la valeur a vraiment changé : un `onBlur` qui rappelle `onChange` ne coûte pas le clic", () => {
    expect(nextEpoch(3, false)).toBe(3);
    expect(nextEpoch(3, true)).toBe(4);
    const unchanged = { ...seen, epoch: nextEpoch(seen.epoch, false) };
    expect(waitIsStale(ticket, unchanged)).toBe(false);
    const changed = { ...seen, epoch: nextEpoch(seen.epoch, true) };
    expect(waitIsStale(ticket, changed)).toBe(true);
  });
});
