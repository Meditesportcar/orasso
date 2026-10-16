// Lot 16 : casquettes de l'appli (sélection, repli, pastille, redirection) et calculs purs de l'écran Moi.
import type { AccountSettings, PersonaEntry, StructureCard } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { passwordFormError } from "./passwordForm";
import {
  entryOfPersona,
  FAN,
  FAN_ENTRY,
  homeOf,
  initialOf,
  isActive,
  kindOfSegment,
  misplacedGroup,
  otherBadges,
  parsePersona,
  resolvePersona,
  serializePersona,
} from "./personaModel";
import {
  addDepartment,
  applySettingsPatch,
  normalizeDepartment,
  prefsWith,
  toggleMutedType,
  typeIsOn,
} from "./settingsPatch";
import { sliderValueAt } from "./slider";
import { filterStructures } from "./structureSearch";
import { totpSecretOf } from "./totp";

const orga: PersonaEntry = { kind: "organizer", id: "s-1", label: "MéditeSportCar", logoUrl: null, badge: 3 };
const orga2: PersonaEntry = { kind: "organizer", id: "s-2", label: "Club Roues", logoUrl: null, badge: 0 };
const pro: PersonaEntry = { kind: "pro", id: "p-1", label: "Garage du Port", logoUrl: null, badge: 0 };
const entries = [FAN_ENTRY, orga, orga2, pro];

describe("casquettes : sélection et repli", () => {
  it("garde la casquette mémorisée si elle existe encore", () => {
    expect(resolvePersona({ kind: "organizer", structureId: "s-2" }, entries)).toEqual({
      kind: "organizer",
      structureId: "s-2",
    });
    expect(resolvePersona({ kind: "pro", proProfileId: "p-1" }, entries)).toEqual({ kind: "pro", proProfileId: "p-1" });
  });

  it("revient au passionné si la casquette a disparu (structure quittée, fiche pro supprimée, profil prestataire retiré)", () => {
    expect(resolvePersona({ kind: "organizer", structureId: "s-9" }, entries)).toEqual(FAN);
    expect(resolvePersona({ kind: "pro", proProfileId: "p-9" }, [FAN_ENTRY, orga])).toEqual(FAN);
    expect(resolvePersona({ kind: "provider" }, entries)).toEqual(FAN);
    expect(resolvePersona(null, entries)).toEqual(FAN);
  });

  it("le profil prestataire est une casquette sans identifiant à retenir", () => {
    const provider: PersonaEntry = { kind: "provider", id: "pr-1", label: "Les Roulottes", logoUrl: null, badge: 0 };
    expect(resolvePersona({ kind: "provider" }, [FAN_ENTRY, provider])).toEqual({ kind: "provider" });
    expect(entryOfPersona({ kind: "provider" }, [FAN_ENTRY, provider])).toBe(provider);
  });

  it("retrouve la ligne d'une casquette et la marque active", () => {
    const persona = { kind: "organizer", structureId: "s-1" } as const;
    expect(entryOfPersona(persona, entries)).toBe(orga);
    expect(isActive(persona, orga)).toBe(true);
    expect(isActive(persona, orga2)).toBe(false);
    expect(isActive(FAN, FAN_ENTRY)).toBe(true);
    expect(isActive(FAN, orga)).toBe(false);
  });
});

describe("casquettes : pastille de l'avatar", () => {
  it("compte les autres casquettes seulement", () => {
    expect(otherBadges(FAN, entries)).toBe(3);
    expect(otherBadges({ kind: "organizer", structureId: "s-1" }, entries)).toBe(0);
    expect(otherBadges({ kind: "organizer", structureId: "s-2" }, entries)).toBe(3);
    expect(otherBadges(FAN, [FAN_ENTRY])).toBe(0);
  });
});

describe("casquettes : groupes de routes", () => {
  it("chaque casquette a son premier écran", () => {
    expect(homeOf(FAN)).toBe("/(tabs)/accueil");
    expect(homeOf({ kind: "organizer", structureId: "s-1" })).toBe("/(orga)/direct");
    expect(homeOf({ kind: "pro", proProfileId: "p-1" })).toBe("/(pro)/scanner");
    expect(homeOf({ kind: "provider" })).toBe("/(provider)/candidatures");
  });

  it("redirige seulement quand l'URL est dans le groupe d'une autre casquette", () => {
    expect(kindOfSegment("(orga)")).toBe("organizer");
    expect(kindOfSegment("moi")).toBeNull();
    expect(misplacedGroup(FAN, "(tabs)")).toBe(false);
    expect(misplacedGroup(FAN, "(orga)")).toBe(true);
    expect(misplacedGroup({ kind: "organizer", structureId: "s-1" }, "(tabs)")).toBe(true);
    expect(misplacedGroup({ kind: "organizer", structureId: "s-1" }, "(orga)")).toBe(false);
    // Moi, une page d'événement, le jour J servent toutes les casquettes.
    expect(misplacedGroup({ kind: "pro", proProfileId: "p-1" }, "moi")).toBe(false);
    expect(misplacedGroup({ kind: "pro", proProfileId: "p-1" }, "e")).toBe(false);
    expect(misplacedGroup(FAN, undefined)).toBe(false);
  });
});

describe("casquettes : mémorisation", () => {
  it("relit ce qu'elle a écrit et ignore le reste", () => {
    for (const p of [
      FAN,
      { kind: "organizer", structureId: "s-1" },
      { kind: "pro", proProfileId: "p-1" },
      { kind: "provider" },
    ] as const) {
      expect(parsePersona(serializePersona(p))).toEqual(p);
    }
    expect(parsePersona(null)).toBeNull();
    expect(parsePersona("pas du json")).toBeNull();
    expect(parsePersona('{"kind":"organizer"}')).toBeNull();
    expect(parsePersona('{"kind":"admin"}')).toBeNull();
  });

  it("initiale pour une casquette sans logo", () => {
    expect(initialOf(orga)).toBe("M");
    expect(initialOf({ ...orga, label: "  " })).toBe("?");
  });
});

describe("réglages du compte", () => {
  const base: AccountSettings = {
    notificationPrefs: { application: true, event: true, social: true, grade: true, staff: true, account: true },
    mutedTypes: ["new_event_followed"],
    visibility: "public",
    departments: ["66"],
    radiusKm: 50,
    interests: [],
    homeWidgets: null,
  };

  it("fusionne les familles et remplace le reste", () => {
    const next = applySettingsPatch(base, {
      notificationPrefs: { application: true, event: false, social: true, grade: true },
      visibility: "private",
      radiusKm: 120,
    });
    expect(next.notificationPrefs).toMatchObject({ event: false, staff: true, account: true });
    expect(next.visibility).toBe("private");
    expect(next.radiusKm).toBe(120);
    expect(next.departments).toEqual(["66"]);
  });

  it("l'API reçoit toujours les quatre familles", () => {
    expect(prefsWith({ application: true, event: false }, "grade", false)).toEqual({
      application: true,
      event: false,
      social: true,
      grade: false,
    });
    // Une famille qui n'est pas réglable (staff) n'est jamais ajoutée.
    expect(Object.keys(prefsWith({}, "staff", false)).sort()).toEqual(["application", "event", "grade", "social"]);
  });

  it("coupe et rétablit un type de notification sans doublon", () => {
    expect(toggleMutedType([], "event_reminder_eve", false)).toEqual(["event_reminder_eve"]);
    expect(toggleMutedType(["event_reminder_eve"], "event_reminder_eve", false)).toEqual(["event_reminder_eve"]);
    expect(toggleMutedType(["a", "b"], "a", true)).toEqual(["b"]);
    expect(typeIsOn({ event: true }, ["x"], "event", "y")).toBe(true);
    expect(typeIsOn({ event: true }, ["y"], "event", "y")).toBe(false);
    expect(typeIsOn({ event: false }, [], "event", "y")).toBe(false);
  });

  it("reconnaît les départements saisis à la main", () => {
    expect(normalizeDepartment("66")).toBe("66");
    expect(normalizeDepartment(" 9 ")).toBe("09");
    expect(normalizeDepartment("2a")).toBe("2A");
    expect(normalizeDepartment("974")).toBe("974");
    expect(normalizeDepartment("20")).toBeNull();
    expect(normalizeDepartment("96")).toBeNull();
    expect(normalizeDepartment("")).toBeNull();
    expect(addDepartment(["66"], "11")).toEqual(["66", "11"]);
    expect(addDepartment(["66", "11"], "66")).toEqual(["66", "11"]);
  });

  it("le curseur du rayon : de 10 à 300 km par pas de 10", () => {
    expect(sliderValueAt(0, 290, 10, 300, 10)).toBe(10);
    expect(sliderValueAt(290, 290, 10, 300, 10)).toBe(300);
    expect(sliderValueAt(140, 290, 10, 300, 10)).toBe(150);
    expect(sliderValueAt(-40, 290, 10, 300, 10)).toBe(10);
    expect(sliderValueAt(999, 290, 10, 300, 10)).toBe(300);
    expect(sliderValueAt(50, 0, 10, 300, 10)).toBe(10);
  });
});

describe("sécurité du compte", () => {
  it("contrôle le changement de mot de passe", () => {
    expect(passwordFormError("", "nouveau-123", "nouveau-123")).toMatch(/actuel/);
    expect(passwordFormError("ancien-123", "court", "court")).toMatch(/8 caractères/);
    expect(passwordFormError("ancien-123", "ancien-123", "ancien-123")).toMatch(/différent/);
    expect(passwordFormError("ancien-123", "nouveau-123", "autre-chose-1")).toMatch(/pas identiques/);
    expect(passwordFormError("ancien-123", "nouveau-123", "nouveau-123")).toBeNull();
  });

  it("lit la clé de l'URI otpauth en groupes de quatre", () => {
    expect(totpSecretOf("otpauth://totp/Orasso:a%40b.fr?secret=ABCDEFGHIJKLMNOP&issuer=Orasso&digits=6")).toBe(
      "ABCD EFGH IJKL MNOP",
    );
    expect(totpSecretOf("otpauth://totp/x")).toBe("");
  });

  it("cherche une structure sans tenir compte des accents ni de la casse", () => {
    const s = (name: string, city: string | null): StructureCard => ({
      slug: name,
      name,
      kind: "association",
      logoUrl: null,
      city,
      department: "66",
      upcomingCount: 0,
    });
    const list = [s("MéditeSportCar", "Canet"), s("Club Roues", "Perpignan")];
    expect(filterStructures(list, "mediTE").map((x) => x.name)).toEqual(["MéditeSportCar"]);
    expect(filterStructures(list, "perpi").map((x) => x.name)).toEqual(["Club Roues"]);
    expect(filterStructures(list, "  ")).toHaveLength(2);
    expect(filterStructures(list, "zzz")).toHaveLength(0);
  });
});
