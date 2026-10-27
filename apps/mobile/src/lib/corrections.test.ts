// Lot 36 : heure de Paris avec l'année quand elle diffère (copie d'événement), liens du site réécrits pour l'appli.
import { describe, expect, it } from "vitest";

import { redirectSystemPath } from "../app/+native-intent";
import { formatDayHour, formatDayHourYear } from "./format";
import { passwordFormError } from "./passwordForm";

/** Lot R3b, tour 2 : l'année de référence est passée explicitement (ces tests ne cassent pas le 1er janvier). */
const IN_2026 = new Date("2026-06-01T12:00:00Z");

describe("dates", () => {
  const now = new Date("2026-10-18T14:50:00Z");

  it("heure de Paris, quel que soit le fuseau de l'appareil", () => {
    expect(formatDayHour("2026-10-17T13:12:00Z", undefined, IN_2026)).toBe("Sam 17 oct · 15\u00a0h\u00a012");
  });

  it("l'année s'affiche quand elle n'est pas l'année en cours", () => {
    expect(formatDayHourYear("2026-10-17T13:12:00Z", now)).toBe("Sam 17 oct · 15\u00a0h\u00a012");
    expect(formatDayHourYear("2027-10-16T13:12:00Z", now)).toBe("Sam 16 oct 2027 · 15\u00a0h\u00a012");
  });
});

describe("liens du site ouverts dans l'appli", () => {
  it("candidater et inscription en crew réécrits, le reste inchangé", () => {
    expect(redirectSystemPath({ path: "https://dev.orasso.fr/e/nocturne-2026/candidater", initial: true })).toBe(
      "/candidater/nocturne-2026",
    );
    expect(redirectSystemPath({ path: "/e/nocturne-2026/crew", initial: false })).toBe(
      "/crew/inscription?event=nocturne-2026",
    );
    expect(redirectSystemPath({ path: "/e/nocturne-2026", initial: true })).toBe("/e/nocturne-2026");
    expect(redirectSystemPath({ path: "/verification-email?token=abc", initial: true })).toBe(
      "/verification-email?token=abc",
    );
  });

  it("lot 40 : anciens chemins d'Accès, de la Boîte et de Moi vers leur nouvelle place", () => {
    expect(redirectSystemPath({ path: "https://orasso.fr/app/acces?avis=abc", initial: true })).toBe("/acces?avis=abc");
    expect(redirectSystemPath({ path: "/app/sorties", initial: false })).toBe("/acces");
    expect(redirectSystemPath({ path: "/app/boite", initial: true })).toBe("/boite");
    expect(redirectSystemPath({ path: "/app/boite/demandes", initial: true })).toBe("/boite?segment=demandes");
    const id = "0b9f6c1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(redirectSystemPath({ path: `/app/boite/${id}`, initial: true })).toBe(`/boite/${id}`);
    expect(redirectSystemPath({ path: "/app/moi", initial: true })).toBe("/moi");
    expect(redirectSystemPath({ path: "/acces", initial: true })).toBe("/acces");
  });
});

describe("mot de passe", () => {
  it("10 caractères au moins, comme partout", () => {
    expect(passwordFormError("ancien-mot-de-passe", "123456789", "123456789")).toMatch(/10 caractères/);
    expect(passwordFormError("ancien-mot-de-passe", "1234567890", "1234567890")).toBeNull();
  });
});
