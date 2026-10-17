// Lot 35a : calculs purs de la structure et de l'équipe (casquette Organisateur).
import type { StructureMember, StructureNoteView, StructureOrganizer } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import type { StructureBan } from "./api/structure";
import { teamRequestTarget } from "./links";
import {
  badgeDaysLeft,
  banIssue,
  canAddDocument,
  canManageMember,
  canRemoveDocuments,
  canShowSubmit,
  exportFileName,
  exportReasonIssue,
  formOfStructure,
  groupNotesByPerson,
  inviteBody,
  isSuspended,
  memberGroups,
  myRoleIn,
  normalizeUrl,
  showVerificationSteps,
  sortedBans,
  structureFormChanged,
  structureFormIssue,
  structureUpdateBody,
  templateIssue,
} from "./teamModel";

const member = (over: Partial<StructureMember>): StructureMember => ({
  userId: "u",
  pseudo: "Zoe",
  role: "staff",
  staffRoles: [],
  canDecide: false,
  status: "active",
  joinedAt: null,
  ...over,
});

describe("membres de la structure", () => {
  const members = [
    member({ userId: "1", pseudo: "Zoé", role: "staff" }),
    member({ userId: "2", pseudo: "Damien", role: "owner" }),
    member({ userId: "3", pseudo: "Alice", role: "staff" }),
    member({ userId: "4", pseudo: "Bastien", role: "co_organizer" }),
    member({ userId: "5", pseudo: "Chloé", status: "requested" }),
    member({ userId: "6", pseudo: "Anaïs", status: "requested" }),
    member({ userId: "7", pseudo: "Hugo", status: "invited" }),
    member({ userId: "8", pseudo: "Ancien", status: "removed" }),
  ];

  it("sépare demandes, invitations et membres actifs, sans les retirés", () => {
    const g = memberGroups(members);
    expect(g.requests.map((m) => m.pseudo)).toEqual(["Anaïs", "Chloé"]);
    expect(g.invited.map((m) => m.pseudo)).toEqual(["Hugo"]);
    expect(g.active.map((m) => m.pseudo)).toEqual(["Damien", "Bastien", "Alice", "Zoé"]);
  });

  it("donne mon rôle dans la structure active, jamais celui d'une invitation", () => {
    const memberships = [
      { structureId: "a", role: "owner" as const, status: "active" },
      { structureId: "b", role: "co_organizer" as const, status: "invited" },
    ];
    expect(myRoleIn(memberships, "a")).toBe("owner");
    expect(myRoleIn(memberships, "b")).toBeNull();
    expect(myRoleIn(undefined, "a")).toBeNull();
  });

  it("le propriétaire gère le staff et les co-organisateurs, le co-organisateur seulement le staff, jamais le propriétaire", () => {
    expect(canManageMember("owner", { role: "co_organizer" })).toBe(true);
    expect(canManageMember("owner", { role: "staff" })).toBe(true);
    expect(canManageMember("owner", { role: "owner" })).toBe(false);
    expect(canManageMember("co_organizer", { role: "staff" })).toBe(true);
    expect(canManageMember("co_organizer", { role: "co_organizer" })).toBe(false);
    expect(canManageMember("co_organizer", { role: "owner" })).toBe(false);
    expect(canManageMember("staff", { role: "staff" })).toBe(false);
    expect(canManageMember(null, { role: "staff" })).toBe(false);
  });

  it("une structure suspendue est reconnue", () => {
    expect(isSuspended({ verification: "suspended" })).toBe(true);
    expect(isSuspended({ verification: "verified" })).toBe(false);
    expect(isSuspended(null)).toBe(false);
  });
});

describe("invitation", () => {
  const base = { role: "staff" as const, staffRoles: ["scan" as const], canDecide: true };

  it("un @ dit que c'est un e-mail, sinon un pseudo", () => {
    expect(inviteBody({ ...base, who: " julie@orasso.local " }, "owner")).toEqual({
      email: "julie@orasso.local",
      role: "staff",
      staffRoles: ["scan"],
      canDecide: true,
    });
    expect(inviteBody({ ...base, who: "Julie_66" }, "owner")).toEqual({
      pseudo: "Julie_66",
      role: "staff",
      staffRoles: ["scan"],
      canDecide: true,
    });
  });

  it("refuse une saisie vide ou un pseudo hors limites", () => {
    expect(inviteBody({ ...base, who: "  " }, "owner")).toEqual({ error: "Indique le pseudo ou l'e-mail du compte." });
    expect(inviteBody({ ...base, who: "ab" }, "owner")).toEqual({ error: "Un pseudo fait de 3 à 24 caractères." });
    expect(inviteBody({ ...base, who: "a".repeat(25) }, "owner")).toEqual({
      error: "Un pseudo fait de 3 à 24 caractères.",
    });
  });

  it("seul le propriétaire nomme un co-organisateur", () => {
    expect(inviteBody({ ...base, who: "Julie_66", role: "co_organizer" }, "owner")).toMatchObject({
      role: "co_organizer",
    });
    expect(inviteBody({ ...base, who: "Julie_66", role: "co_organizer" }, "co_organizer")).toMatchObject({
      role: "staff",
    });
  });
});

describe("fiche de la structure", () => {
  const structure = {
    name: "MéditeSportCar",
    description: null,
    addressLine: "1 rue du Port",
    postalCode: "66000",
    city: "Perpignan",
    departments: ["66", "11"],
    website: "https://meditesportcar.fr",
    socials: { instagram: "https://instagram.com/msc" },
  } as unknown as StructureOrganizer;

  it("remplit le formulaire sans null", () => {
    const form = formOfStructure(structure);
    expect(form).toMatchObject({ name: "MéditeSportCar", description: "", instagram: "https://instagram.com/msc" });
    expect(form.facebook).toBe("");
    expect(form.departments).toEqual(["66", "11"]);
  });

  it("ajoute https:// aux adresses sans schéma et vide en null, comme le site", () => {
    expect(normalizeUrl("meditesportcar.fr")).toBe("https://meditesportcar.fr");
    expect(normalizeUrl("http://exemple.fr")).toBe("http://exemple.fr");
    expect(normalizeUrl("   ")).toBeNull();
  });

  it("prépare le corps du PATCH : champs vides à null, réseaux renseignés seulement", () => {
    const form = { ...formOfStructure(structure), description: "  ", facebook: "facebook.com/msc", name: "  MSC  " };
    expect(structureUpdateBody(form)).toEqual({
      name: "MSC",
      description: null,
      addressLine: "1 rue du Port",
      postalCode: "66000",
      city: "Perpignan",
      departments: ["66", "11"],
      website: "https://meditesportcar.fr",
      socials: { instagram: "https://instagram.com/msc", facebook: "https://facebook.com/msc" },
    });
  });

  it("repère une modification, ignore les espaces et exige un nom", () => {
    const saved = formOfStructure(structure);
    expect(structureFormChanged(saved, saved)).toBe(false);
    expect(structureFormChanged({ ...saved, city: " Perpignan " }, saved)).toBe(false);
    expect(structureFormChanged({ ...saved, city: "Canet" }, saved)).toBe(true);
    expect(structureFormChanged({ ...saved, departments: ["66"] }, saved)).toBe(true);
    expect(structureFormIssue({ ...saved, name: "A" })).toMatch(/au moins 2/);
    expect(structureFormIssue(saved)).toBeNull();
  });
});

describe("vérification et badge", () => {
  it("les étapes s'affichent tant que la structure n'est pas vérifiée", () => {
    expect(showVerificationSteps({ verification: "unverified" })).toBe(true);
    expect(showVerificationSteps({ verification: "pending" })).toBe(true);
    expect(showVerificationSteps({ verification: "suspended" })).toBe(true);
    expect(showVerificationSteps({ verification: "verified" })).toBe(false);
  });

  it("dépôt, retrait et envoi suivent l'état du dossier", () => {
    expect(canAddDocument({ verification: "unverified" })).toBe(true);
    expect(canAddDocument({ verification: "pending" })).toBe(false);
    expect(canAddDocument({ verification: "verified" })).toBe(false);
    expect(canRemoveDocuments({ verification: "unverified" })).toBe(true);
    expect(canRemoveDocuments({ verification: "pending" })).toBe(false);
    expect(canRemoveDocuments({ verification: "suspended" })).toBe(false);
    expect(canShowSubmit({ verification: "unverified" })).toBe(true);
    expect(canShowSubmit({ verification: "pending" })).toBe(false);
  });

  it("compte les jours avant l'échéance du badge", () => {
    const now = new Date("2026-10-17T10:00:00Z");
    expect(badgeDaysLeft(null, now)).toBeNull();
    expect(badgeDaysLeft("2026-10-27T10:00:00Z", now)).toBe(10);
    expect(badgeDaysLeft("2026-10-17T12:00:00Z", now)).toBe(1);
    expect(badgeDaysLeft("2026-10-01T10:00:00Z", now)).toBe(0);
  });
});

describe("bannissements et modèles", () => {
  it("range les bannissements du plus récent au plus ancien", () => {
    const bans: StructureBan[] = [
      { userId: "1", pseudo: "Vieux", reason: null, at: "2026-01-01T00:00:00Z" },
      { userId: "2", pseudo: "Neuf", reason: "Insultes", at: "2026-09-01T00:00:00Z" },
    ];
    expect(sortedBans(bans).map((b) => b.pseudo)).toEqual(["Neuf", "Vieux"]);
  });

  it("vérifie le pseudo à bannir", () => {
    expect(banIssue("ab")).not.toBeNull();
    expect(banIssue("Kenji_66")).toBeNull();
  });

  it("un modèle demande un nom et un texte", () => {
    expect(templateIssue({ name: " ", body: "Bonjour" })).toBe("Donne un nom au modèle.");
    expect(templateIssue({ name: "Rappel", body: "  " })).toBe("Écris le texte du modèle.");
    expect(templateIssue({ name: "x".repeat(61), body: "a" })).toMatch(/60/);
    expect(templateIssue({ name: "Rappel", body: "Bonjour {{pseudo}}" })).toBeNull();
  });
});

describe("export et notes", () => {
  it("le motif de l'export demande au moins 10 caractères", () => {
    expect(exportReasonIssue("court")).toMatch(/10/);
    expect(exportReasonIssue("         ")).toMatch(/10/);
    expect(exportReasonIssue("Demande de la gendarmerie")).toBeNull();
  });

  it("lit le nom du fichier et écarte tout chemin", () => {
    expect(exportFileName('attachment; filename="meditesportcar-salon-2026.csv"')).toBe(
      "meditesportcar-salon-2026.csv",
    );
    expect(exportFileName(null)).toBe("participants.csv");
    expect(exportFileName('attachment; filename="../../etc/passwd"')).toBe(".._.._etc_passwd");
    expect(exportFileName('attachment; filename=""')).toBe("participants.csv");
  });

  it("regroupe les notes par personne, les plus récentes d'abord", () => {
    const note = (id: string, userId: string, pseudo: string) =>
      ({ id, subjectUserId: userId, subjectPseudo: pseudo }) as StructureNoteView;
    const groups = groupNotesByPerson([note("1", "a", "Alice"), note("2", "b", "Bob"), note("3", "a", "Alice")]);
    expect(groups.map((g) => [g.pseudo, g.notes.map((n) => n.id)])).toEqual([
      ["Alice", ["1", "3"]],
      ["Bob", ["2"]],
    ]);
  });
});

describe("notification d'une demande de staff", () => {
  const structureId = "11111111-1111-4111-8111-111111111111";

  it("ouvre l'écran Équipe de la structure de la notification", () => {
    expect(teamRequestTarget({ screen: "staff-requests", structureId })).toBe(structureId);
  });

  it("ne mène nulle part sans identifiant valide ni pour une autre notification", () => {
    expect(teamRequestTarget({ screen: "staff-requests", structureId: "../../x" })).toBeNull();
    expect(teamRequestTarget({ screen: "staff-requests" })).toBeNull();
    expect(teamRequestTarget({ screen: "acces", structureId })).toBeNull();
    expect(teamRequestTarget(null)).toBeNull();
    expect(teamRequestTarget("staff-requests")).toBeNull();
  });
});
