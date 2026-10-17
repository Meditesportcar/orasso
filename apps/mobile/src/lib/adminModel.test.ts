// Lot 35d : administration dans l'appli, logique pure (rôles, sections, saisies, liens profonds, listes, casquette).
import type { AdminOverview } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  adminEntryOf,
  adminLinkOf,
  adminRoleOf,
  adminSections,
  adminTabRoutes,
  assistanceMessageIssue,
  auditRange,
  countOf,
  dateTimeToFr,
  dayToFr,
  departmentsOf,
  moveCode,
  newsletterEditable,
  newsletterPausable,
  orderedCodes,
  overviewTotal,
  parseDateTimeFr,
  parseDayFr,
  parsePoints,
  parseQuota,
  parseYear,
  reasonIssue,
  refusalNoteIssue,
  sectionsOf,
  toggleCode,
  userStateOf,
} from "./adminModel";
import {
  FAN,
  FAN_ENTRY,
  homeOf,
  kindOfSegment,
  misplacedGroup,
  parsePersona,
  personaOfEntry,
  resolvePersona,
  serializePersona,
} from "./personaModel";

const overview: AdminOverview = {
  structuresPending: 2,
  badgesExpiring: 1,
  prosToVerify: 0,
  reportsPending: 3,
  certificationsPending: 0,
  plateTransfersArbitrated: 0,
  otherVehicles: 4,
  malusContestsEscalated: 0,
  sanctionsContested: 1,
  assistanceOpen: 1,
  newslettersScheduled: 0,
};

describe("rôles et casquette Administration", () => {
  it("seuls le modérateur et le super admin ont une administration", () => {
    expect(adminRoleOf("super_admin")).toBe("super_admin");
    expect(adminRoleOf("moderator")).toBe("moderator");
    expect(adminRoleOf("user")).toBeNull();
    expect(adminRoleOf(undefined)).toBeNull();
    expect(adminRoleOf(null)).toBeNull();
  });

  it("la ligne de casquette suit le rôle, et n'existe pas pour un compte ordinaire", () => {
    expect(adminEntryOf("user")).toBeNull();
    expect(adminEntryOf("super_admin")).toMatchObject({ kind: "admin", label: "Administration", badge: 0 });
    expect(adminEntryOf("moderator")).toMatchObject({ kind: "admin", label: "Modération" });
  });

  it("la casquette Administration se mémorise, s'ouvre sur l'accueil et a son groupe de routes", () => {
    const entry = adminEntryOf("super_admin");
    expect(entry).not.toBeNull();
    if (!entry) return;
    expect(personaOfEntry(entry)).toEqual({ kind: "admin" });
    expect(parsePersona(serializePersona({ kind: "admin" }))).toEqual({ kind: "admin" });
    expect(homeOf({ kind: "admin" })).toBe("/(admin)/accueil");
    expect(kindOfSegment("(admin)")).toBe("admin");
    expect(misplacedGroup({ kind: "fan" }, "(admin)")).toBe(true);
    expect(misplacedGroup({ kind: "admin" }, "(admin)")).toBe(false);
    expect(misplacedGroup({ kind: "admin" }, "moi")).toBe(false);
  });

  it("revient au passionné quand le compte perd le rôle (la ligne disparaît)", () => {
    const admin = adminEntryOf("super_admin");
    expect(admin).not.toBeNull();
    if (!admin) return;
    expect(resolvePersona({ kind: "admin" }, [FAN_ENTRY, admin])).toEqual({ kind: "admin" });
    expect(resolvePersona({ kind: "admin" }, [FAN_ENTRY])).toEqual(FAN);
  });
});

describe("sections de l'administration", () => {
  it("le super admin voit toutes les pages, le modérateur seulement la file des signalements", () => {
    expect(sectionsOf("queues", "moderator", false).map((s) => s.id)).toEqual(["signalements"]);
    expect(sectionsOf("registries", "moderator", false)).toEqual([]);
    expect(sectionsOf("manage", "moderator", true)).toEqual([]);
    const all = adminSections.map((s) => s.id);
    expect(all).toContain("verification");
    expect(all).toContain("newsletter");
    expect(sectionsOf("queues", "super_admin", false).length).toBeGreaterThanOrEqual(10);
  });

  it("l'horloge simulée n'est proposée que si l'API l'annonce", () => {
    expect(sectionsOf("manage", "super_admin", false).map((s) => s.id)).not.toContain("horloge");
    expect(sectionsOf("manage", "super_admin", true).map((s) => s.id)).toContain("horloge");
  });

  it("chaque file du site a sa tuile avec son compteur", () => {
    const keys = sectionsOf("queues", "super_admin", false)
      .map((s) => s.count)
      .filter(Boolean);
    expect(new Set(keys)).toEqual(new Set(Object.keys(overview)));
  });

  it("compteur d'une section et total de l'accueil", () => {
    const reports = adminSections.find((s) => s.id === "signalements");
    expect(reports && countOf(reports, overview)).toBe(3);
    expect(reports && countOf(reports, null)).toBeUndefined();
    const registry = adminSections.find((s) => s.id === "utilisateurs");
    expect(registry && countOf(registry, overview)).toBeUndefined();
    expect(overviewTotal(overview)).toBe(12);
  });

  it("les onglets du modérateur se limitent à l'accueil et aux signalements", () => {
    expect(Object.keys(adminTabRoutes("moderator"))).toEqual(["accueil", "signalements"]);
    expect(Object.keys(adminTabRoutes("super_admin"))).toEqual(["accueil", "signalements", "registres", "gestion"]);
  });
});

describe("saisies", () => {
  it("le motif est obligatoire (5 caractères au moins), comme sur le site", () => {
    expect(reasonIssue("")).not.toBeNull();
    expect(reasonIssue("  abc ")).not.toBeNull();
    expect(reasonIssue("raison")).toBeNull();
    expect(refusalNoteIssue("  ")).not.toBeNull();
    expect(refusalNoteIssue("Pièce illisible")).toBeNull();
  });

  it("dates JJ/MM/AAAA", () => {
    expect(parseDayFr("25/12/2026")).toBe("2026-12-25");
    expect(parseDayFr(" 1/2/2027 ")).toBe("2027-02-01");
    expect(parseDayFr("31/02/2027")).toBeNull();
    expect(parseDayFr("2026-12-25")).toBeNull();
    expect(dayToFr("2026-12-25")).toBe("25/12/2026");
  });

  it("date et heure de Paris, heure d'été et d'hiver comprises", () => {
    expect(parseDateTimeFr("25/12/2026 18:30")).toBe("2026-12-25T17:30:00.000Z");
    expect(parseDateTimeFr("17/10/2026 18:30")).toBe("2026-10-17T16:30:00.000Z");
    expect(parseDateTimeFr("17/10/2026 18h30")).toBe("2026-10-17T16:30:00.000Z");
    expect(parseDateTimeFr("17/10/2026 24:00")).toBeNull();
    expect(parseDateTimeFr("17/10/2026")).toBeNull();
    expect(dateTimeToFr("2026-12-25T17:30:00.000Z")).toBe("25/12/2026 18:30");
  });

  it("bornes du journal : jour entier, heure de Paris", () => {
    expect(auditRange("", "")).toEqual({ invalid: false });
    expect(auditRange("17/10/2026", "18/10/2026")).toEqual({
      from: "2026-10-16T22:00:00.000Z",
      to: "2026-10-18T21:59:00.000Z",
      invalid: false,
    });
    expect(auditRange("17-10-2026", "").invalid).toBe(true);
  });

  it("quota, points, années, départements", () => {
    expect(parseQuota("")).toBeNull();
    expect(parseQuota("12")).toBe(12);
    expect(parseQuota("31")).toBeUndefined();
    expect(parseQuota("abc")).toBeUndefined();
    expect(parsePoints("-5")).toBe(-5);
    expect(parsePoints("+10")).toBe(10);
    expect(parsePoints("0")).toBeNull();
    expect(parsePoints("1,5")).toBeNull();
    expect(parseYear("")).toBeNull();
    expect(parseYear("1999")).toBe(1999);
    expect(parseYear("99")).toBeUndefined();
    expect(departmentsOf("66, 11;2a  ")).toEqual(["66", "11", "2A"]);
    expect(assistanceMessageIssue("court")).not.toBeNull();
    expect(assistanceMessageIssue("Besoin d'aide pour le tri")).toBeNull();
  });
});

describe("listes administrables", () => {
  const all = ["a", "b", "c", "d"] as const;
  it("les codes proposés d'abord, dans leur ordre", () => {
    expect(orderedCodes(all, ["c", "a"])).toEqual(["c", "a", "b", "d"]);
    expect(orderedCodes(all, [])).toEqual(["a", "b", "c", "d"]);
  });
  it("cocher range à la fin, décocher retire", () => {
    expect(toggleCode(["c", "a"], "b", true)).toEqual(["c", "a", "b"]);
    expect(toggleCode(["c", "a"], "c", false)).toEqual(["a"]);
    expect(toggleCode(["c", "a"], "c", true)).toEqual(["a", "c"]);
  });
  it("monter et descendre d'un cran, sans sortir de la liste", () => {
    expect(moveCode(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveCode(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveCode(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveCode(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveCode(["a", "b"], "z" as never, 1)).toEqual(["a", "b"]);
  });
});

describe("état d'un compte et newsletter", () => {
  const at = new Date("2026-10-17T10:00:00Z");
  it("supprimé, banni, suspendu ou actif", () => {
    expect(userStateOf({ deletedAt: "2026-10-01T00:00:00Z", bannedAt: null, suspendedUntil: null }, at)).toBe(
      "Supprimé",
    );
    expect(userStateOf({ deletedAt: null, bannedAt: "2026-10-01T00:00:00Z", suspendedUntil: null }, at)).toBe("Banni");
    expect(userStateOf({ deletedAt: null, bannedAt: null, suspendedUntil: "2026-10-20T00:00:00Z" }, at)).toBe(
      "Suspendu",
    );
    expect(userStateOf({ deletedAt: null, bannedAt: null, suspendedUntil: "2026-10-10T00:00:00Z" }, at)).toBeNull();
  });
  it("une newsletter se modifie en brouillon ou planifiée, se met en pause planifiée ou en cours", () => {
    expect(newsletterEditable(undefined)).toBe(true);
    expect(newsletterEditable("draft")).toBe(true);
    expect(newsletterEditable("scheduled")).toBe(true);
    expect(newsletterEditable("sending")).toBe(false);
    expect(newsletterEditable("paused")).toBe(false);
    expect(newsletterEditable("sent")).toBe(false);
    expect(newsletterPausable("scheduled")).toBe(true);
    expect(newsletterPausable("sending")).toBe(true);
    expect(newsletterPausable("paused")).toBe(false);
    expect(newsletterPausable("draft")).toBe(false);
  });
});

describe("liens profonds des alertes de l'équipe", () => {
  it("les liens connus mènent à l'écran de la casquette Administration", () => {
    expect(adminLinkOf("/admin/signalements")).toBe("/(admin)/signalements");
    expect(adminLinkOf("/admin/assistance")).toBe("/(admin)/assistance");
    expect(adminLinkOf("/admin/signalements/")).toBe("/(admin)/signalements");
    expect(adminLinkOf("/admin/signalements?statut=pending")).toBe("/(admin)/signalements");
  });
  it("jamais un chemin libre ni une adresse externe", () => {
    expect(adminLinkOf("/admin/utilisateurs/abc")).toBeNull();
    expect(adminLinkOf("https://evil.example/admin/signalements")).toBeNull();
    expect(adminLinkOf("/app/acces")).toBeNull();
    expect(adminLinkOf(undefined)).toBeNull();
    expect(adminLinkOf(42)).toBeNull();
  });
});
