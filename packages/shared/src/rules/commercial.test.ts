import { describe, expect, it } from "vitest";

import {
  commercialField,
  commercialIssue,
  commercialLineState,
  commercialPartnerOf,
  mentionedSlugs,
  noCommercialDraft,
} from "./commercial";

const wrap = { proId: "p1", slug: "wrap-66", name: "Wrap 66" };
const garage = { proId: "p2", slug: "garage-du-port", name: "Garage du Port" };

describe("mentionedSlugs", () => {
  it("lit les @slug, en minuscules, sans doublon, dans l'ordre", () => {
    expect(mentionedSlugs("Merci @Wrap-66 et @garage-du-port, encore @wrap-66 !")).toEqual([
      "wrap-66",
      "garage-du-port",
    ]);
  });
  it("ignore ce qui est collé à un autre mot, une adresse e-mail et un pseudo", () => {
    expect(mentionedSlugs("a@wrap-66.fr")).toEqual([]);
    expect(mentionedSlugs("@@wrap-66")).toEqual([]);
    expect(mentionedSlugs("@damien_66")).toEqual([]);
    expect(mentionedSlugs("")).toEqual([]);
    expect(mentionedSlugs(null)).toEqual([]);
  });
  it("accepte la ponctuation après le slug", () => {
    expect(mentionedSlugs("(@wrap-66).")).toEqual(["wrap-66"]);
    expect(mentionedSlugs("merci @wrap-66.")).toEqual(["wrap-66"]);
    expect(mentionedSlugs("@wrap-66, @garage-2!")).toEqual(["wrap-66", "garage-2"]);
  });
  it("prend le mot entier : un slug suivi de _ ou d'une lettre n'est pas un autre slug", () => {
    expect(mentionedSlugs("@garage-du_port")).toEqual([]);
    expect(mentionedSlugs("@wrap-66_x")).toEqual([]);
    expect(mentionedSlugs("@wrap-66é")).toEqual([]);
    expect(mentionedSlugs("@Wrap-66")).toEqual(["wrap-66"]);
  });
  it("bornes Unicode : jamais dans un mot ni une adresse (andré@wrap-66.fr, email@wrap-66.fr, été@wrap-66)", () => {
    expect(mentionedSlugs("andré@wrap-66.fr")).toEqual([]);
    expect(mentionedSlugs("email@wrap-66.fr")).toEqual([]);
    expect(mentionedSlugs("été@wrap-66")).toEqual([]);
    expect(mentionedSlugs("« @wrap-66 »")).toEqual(["wrap-66"]);
  });
  it("deux slugs qui partagent un préfixe : chacun garde le sien", () => {
    const wrapShort = { proId: "p3", slug: "wrap", name: "Wrap" };
    expect(commercialPartnerOf([wrapShort, wrap], [], "@wrap-66")).toBe("p1");
    expect(commercialPartnerOf([wrapShort, wrap], [], "@wrap")).toBe("p3");
    expect(commercialPartnerOf([wrapShort], [], "@wrap-66_x")).toBeNull();
  });
});

describe("commercialPartnerOf", () => {
  it("une identification passe avant la légende ; sans partenaire, rien", () => {
    expect(commercialPartnerOf([wrap, garage], ["p2"], "@wrap-66")).toBe("p2");
    expect(commercialPartnerOf([wrap, garage], [], "@garage-du-port puis @wrap-66")).toBe("p2");
    expect(commercialPartnerOf([wrap], ["p9"], "@autre")).toBeNull();
    expect(commercialPartnerOf([], ["p1"], "@wrap-66")).toBeNull();
  });
});

describe("la ligne de l'écran de publication", () => {
  it("partenaire cité : ligne obligatoire, rien à envoyer (l'API pose)", () => {
    const line = commercialLineState([wrap], [], "Covering par @wrap-66", noCommercialDraft);
    expect(line).toEqual({ kind: "required", proId: "p1", name: "Wrap 66" });
    expect(commercialField(line)).toEqual({});
    expect(commercialIssue(line, "x")).toBeNull();
  });
  it("sans partenaire : interrupteur ; posé sans pro = ce qui manque ; posé avec un pro = champ envoyé", () => {
    const off = commercialLineState([wrap], [], "rien", noCommercialDraft);
    expect(off).toEqual({ kind: "manual", on: false, pick: null });
    expect(commercialField(off)).toEqual({});
    const noPick = commercialLineState([wrap], [], "rien", { on: true, pick: null });
    expect(commercialIssue(noPick, "Choisis le pro")).toBe("Choisis le pro");
    const picked = commercialLineState([wrap], [], "rien", { on: true, pick: { id: "p7", name: "Atelier" } });
    expect(commercialField(picked)).toEqual({ commercialPartnerId: "p7" });
    expect(commercialIssue(picked, "x")).toBeNull();
  });
  it("un pro choisi à la main puis un partenaire cité : la ligne obligatoire prend la place, rien d'explicite n'est envoyé", () => {
    const line = commercialLineState([wrap], [], "@wrap-66", { on: true, pick: { id: "p7", name: "Atelier" } });
    expect(line.kind).toBe("required");
    expect(commercialField(line)).toEqual({});
  });
});
