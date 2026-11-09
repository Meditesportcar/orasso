import { describe, expect, it } from "vitest";

import { liveAccessHref, showsLocalCopy } from "./liveAccess";

const live = (hasPlace: boolean) => ({ hasPlace, event: { slug: "lydia" } }) as never;
const place = { id: "p1", status: "accepted", event: { slug: "lydia" } };

describe("Mon accès le jour J", () => {
  it("sans place (présence seule) : pas d'accès ; sans événement en cours non plus", () => {
    expect(liveAccessHref(live(false), [place], [])).toBeNull();
    expect(liveAccessHref(null, [place], [])).toBeNull();
  });
  it("place retenue : le QR de la place", () => {
    expect(liveAccessHref(live(true), [place], [])).toBe("/jour-j/p1");
  });
  it("billet valide ou déjà contrôlé : le billet, même après le scan", () => {
    const pass = (status: string) => [{ id: "t1", status, event: { slug: "lydia" } }];
    expect(liveAccessHref(live(true), [], pass("valid"))).toBe("/billet/t1");
    expect(liveAccessHref(live(true), [], pass("used"))).toBe("/billet/t1");
    expect(liveAccessHref(live(true), [], pass("cancelled"))).toBe("/sorties");
  });
});

describe("Données hors ligne", () => {
  it("copie locale avant la première réponse, après une erreur réseau ou serveur", () => {
    const base = { hasData: true, loading: false, failed: false, offline: false };
    expect(showsLocalCopy(base)).toBe(false);
    expect(showsLocalCopy({ ...base, loading: true })).toBe(true);
    expect(showsLocalCopy({ ...base, failed: true })).toBe(true);
    expect(showsLocalCopy({ ...base, offline: true })).toBe(true);
    expect(showsLocalCopy({ ...base, hasData: false, loading: true })).toBe(false);
  });
});
