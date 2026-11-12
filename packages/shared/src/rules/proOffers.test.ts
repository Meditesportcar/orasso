import { describe, expect, it } from "vitest";
import {
  emptyOfferForm,
  isOfferDay,
  offerBody,
  offerDatesLabel,
  offerDatesPhrase,
  offerEditorLabel,
  offerFromBody,
  offerIsLive,
  offerIssue,
  offerState,
  offersView,
  publishStartOffer,
} from "./proOffers";
import { fromWallTime } from "./time";

const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });
const NOV10 = at(11, 10, 10);

describe("offerState : le dernier jour est compris (jours civils de Paris)", () => {
  const offer = { startsOn: "2026-11-08", endsOn: "2026-11-30" };
  it("avant le début : à venir ; le jour du début 0 h 05 : en cours", () => {
    expect(offerState(offer, at(11, 7, 23, 59))).toBe("upcoming");
    expect(offerState(offer, at(11, 8, 0, 5))).toBe("current");
  });
  it("le dernier jour à 23 h 59 : en cours ; le lendemain 0 h 05 : terminée", () => {
    expect(offerState(offer, at(11, 30, 23, 59))).toBe("current");
    expect(offerState(offer, at(12, 1, 0, 5))).toBe("ended");
  });
  it("sans début : en cours dès la publication", () => {
    expect(offerState({ startsOn: null, endsOn: "2026-11-10" }, NOV10)).toBe("current");
  });
  it("changement d'heure (25 octobre 2026, 3 h → 2 h) : la fin du 25 reste comprise jusqu'à minuit de Paris", () => {
    const offerDst = { startsOn: null, endsOn: "2026-10-25" };
    expect(offerState(offerDst, at(10, 25, 23, 30))).toBe("current");
    expect(offerState(offerDst, at(10, 26, 0, 10))).toBe("ended");
    // Passage à l'heure d'été (29 mars 2026).
    const spring = { startsOn: null, endsOn: "2026-03-29" };
    expect(offerState(spring, at(3, 29, 23, 30))).toBe("current");
    expect(offerState(spring, at(3, 30, 0, 10))).toBe("ended");
  });
  it("offerIsLive : à venir et en cours, pas terminée", () => {
    expect(offerIsLive({ startsOn: "2026-12-01", endsOn: "2026-12-31" }, NOV10)).toBe(true);
    expect(offerIsLive({ startsOn: null, endsOn: "2026-11-09" }, NOV10)).toBe(false);
  });
});

describe("offerDatesLabel", () => {
  it("même mois : « Du 8 au 30 nov. »", () => {
    expect(offerDatesLabel({ startsOn: "2026-11-08", endsOn: "2026-11-30" }, NOV10)).toBe("Du 8 au 30 nov.");
  });
  it("sans début : « Jusqu'au 15 déc. »", () => {
    expect(offerDatesLabel({ startsOn: null, endsOn: "2026-12-15" }, NOV10)).toBe("Jusqu'au 15 déc.");
  });
  it("deux mois différents : les deux mois", () => {
    expect(offerDatesLabel({ startsOn: "2026-10-28", endsOn: "2026-11-05" }, NOV10)).toBe("Du 28 oct. au 5 nov.");
  });
  it("passage d'année : les deux années ; une année qui n'est pas la courante est écrite", () => {
    expect(offerDatesLabel({ startsOn: "2026-12-20", endsOn: "2027-01-05" }, NOV10)).toBe(
      "Du 20 déc. 2026 au 5 janv. 2027",
    );
    expect(offerDatesLabel({ startsOn: "2027-02-01", endsOn: "2027-02-15" }, NOV10)).toBe("Du 1 au 15 févr. 2027");
    expect(offerDatesLabel({ startsOn: null, endsOn: "2027-01-15" }, NOV10)).toBe("Jusqu'au 15 janv. 2027");
  });
  it("la phrase de la confirmation est en minuscules", () => {
    expect(offerDatesPhrase({ startsOn: "2026-11-10", endsOn: "2026-11-30" }, NOV10)).toBe("du 10 au 30 nov.");
    expect(offerDatesPhrase({ startsOn: null, endsOn: "2026-12-15" }, NOV10)).toBe("jusqu'au 15 déc.");
  });
  it("la ligne du brouillon écrit les deux jours en entier (R9.2b)", () => {
    expect(offerEditorLabel({ startsOn: "2026-11-10", endsOn: "2026-11-30" }, NOV10)).toBe("Du 10 nov. au 30 nov.");
    expect(offerEditorLabel({ startsOn: "", endsOn: "2026-11-30" }, NOV10)).toBe("Jusqu'au 30 nov.");
    expect(offerEditorLabel({ startsOn: "2026-11-10", endsOn: "" }, NOV10)).toBe("Dès le 10 nov.");
    expect(offerEditorLabel({ startsOn: "", endsOn: "" }, NOV10)).toBe("Choisis la date de fin");
  });
});

describe("offerIssue", () => {
  const ok = { title: "Polish complet", startsOn: "2026-11-08", endsOn: "2026-11-30" };
  it("une offre valide : rien", () => {
    expect(offerIssue(ok, NOV10)).toBeNull();
    expect(offerIssue({ ...ok, startsOn: null, endsOn: "2026-11-10" }, NOV10)).toBeNull();
  });
  it("titre manquant, trop court, trop long (en caractères)", () => {
    expect(offerIssue({ ...ok, title: "" }, NOV10)?.code).toBe("title_required");
    expect(offerIssue({ ...ok, title: " a " }, NOV10)?.code).toBe("title_required");
    expect(offerIssue({ ...ok, title: "🔥" }, NOV10)?.code).toBe("title_required");
    expect(offerIssue({ ...ok, title: "x".repeat(80) }, NOV10)).toBeNull();
    expect(offerIssue({ ...ok, title: "x".repeat(81) }, NOV10)?.code).toBe("title_too_long");
  });
  it("fin manquante, passée, avant le début, jour impossible", () => {
    expect(offerIssue({ ...ok, endsOn: null }, NOV10)).toMatchObject({ code: "ends_required", field: "endsOn" });
    expect(offerIssue({ ...ok, endsOn: "" }, NOV10)?.code).toBe("ends_required");
    expect(offerIssue({ ...ok, endsOn: "2026-11-09" }, NOV10)?.code).toBe("ends_past");
    expect(offerIssue({ ...ok, startsOn: "2026-12-05", endsOn: "2026-12-01" }, NOV10)?.code).toBe("ends_before_start");
    expect(offerIssue({ ...ok, endsOn: "2026-02-30" }, NOV10)?.code).toBe("dates_invalid");
    expect(offerIssue({ ...ok, startsOn: "demain" }, NOV10)).toMatchObject({
      code: "dates_invalid",
      field: "startsOn",
    });
  });
  it("isOfferDay", () => {
    expect(isOfferDay("2026-11-30")).toBe(true);
    expect(isOfferDay("2026-11-31")).toBe(false);
    expect(isOfferDay("30/11/2026")).toBe(false);
    expect(isOfferDay(null)).toBe(false);
  });
});

describe("le corps et les valeurs de départ", () => {
  it("offerBody : début seulement s'il est posé, titre nettoyé", () => {
    expect(offerBody({ on: true, title: " Polish ", startsOn: "", endsOn: "2026-12-15" })).toEqual({
      title: "Polish",
      endsOn: "2026-12-15",
    });
    expect(offerBody({ ...emptyOfferForm, title: "Polish", startsOn: "2026-11-10", endsOn: "2026-12-15" })).toEqual({
      title: "Polish",
      startsOn: "2026-11-10",
      endsOn: "2026-12-15",
    });
  });
  const PRO = "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a02";
  const authors = [{ key: "me" }, { key: `pro:${PRO}`, proId: PRO }];
  it("publishStartOffer : la fiche de l'adresse, l'étiquette seulement si demandée", () => {
    expect(publishStartOffer({ fiche: PRO, etiquette: "offre" }, authors)).toEqual({
      authorKey: `pro:${PRO}`,
      offerOn: true,
    });
    expect(publishStartOffer({ fiche: PRO }, authors)).toEqual({ authorKey: `pro:${PRO}`, offerOn: false });
    expect(publishStartOffer({ fiche: PRO.toUpperCase(), etiquette: "offre" }, authors)?.authorKey).toBe(`pro:${PRO}`);
  });
  it("une adresse mal formée ou une fiche qui n'est pas la sienne : les valeurs habituelles", () => {
    expect(publishStartOffer({ fiche: "pas-un-uuid", etiquette: "offre" }, authors)).toBeNull();
    expect(
      publishStartOffer({ fiche: "11111111-1111-1111-1111-111111111111", etiquette: "offre" }, authors),
    ).toBeNull();
    expect(publishStartOffer({ etiquette: "offre" }, authors)).toBeNull();
  });
});

describe("offerFromBody : l'offre d'un envoi incertain repris", () => {
  it("restaure le titre et les jours ; sans offre, rien", () => {
    expect(offerFromBody({ title: "Polish", startsOn: "2026-11-10", endsOn: "2026-11-30" })).toEqual({
      on: true,
      title: "Polish",
      startsOn: "2026-11-10",
      endsOn: "2026-11-30",
    });
    expect(offerFromBody({ title: "Polish", endsOn: "2026-11-30" }).startsOn).toBe("");
    expect(offerFromBody(undefined)).toEqual(emptyOfferForm);
    expect(offerFromBody(null).on).toBe(false);
  });
});

describe("offersView : la panne avant le vide", () => {
  it("lecture vide puis relecture échouée : panne, jamais « Pas d'offre »", () => {
    expect(offersView({ loading: true, loaded: false, error: false, count: 0 })).toBe("waiting");
    expect(offersView({ loading: false, loaded: true, error: false, count: 0 })).toBe("empty");
    expect(offersView({ loading: false, loaded: true, error: true, count: 0 })).toBe("error");
    expect(offersView({ loading: false, loaded: false, error: true, count: 0 })).toBe("error");
    expect(offersView({ loading: false, loaded: true, error: true, count: 2 })).toBe("list");
  });
});
