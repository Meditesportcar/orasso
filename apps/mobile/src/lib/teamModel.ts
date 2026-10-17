// Structure et équipe de la casquette Organisateur (lot 35a, décision D20) : calculs purs, sans React Native, testés dans
// `teamModel.test.ts`. Aucune règle métier ici (droits, suspension, délais : l'API) ; on choisit quoi afficher et on
// prépare ce que le site envoie déjà (mêmes conversions de la fiche, même invitation par pseudo ou e-mail).
import {
  EXPORT_REASON_MIN,
  type MemberInvite,
  type StaffRole,
  type StructureMember,
  type StructureNoteView,
  type StructureOrganizer,
  type StructureRole,
  type StructureUpdate,
  type StructureVerificationView,
  TEMPLATE_NAME_MAX,
} from "@orasso/shared";

import type { StructureBan } from "./api/structure";

// --- Membres ----------------------------------------------------------------------------------------------------

export type MemberGroups = { requests: StructureMember[]; invited: StructureMember[]; active: StructureMember[] };

const byPseudo = (a: StructureMember, b: StructureMember) => a.pseudo.localeCompare(b.pseudo, "fr");
const roleOrder: Record<StructureRole, number> = { owner: 0, co_organizer: 1, staff: 2 };

/** Demandes reçues, invitations envoyées, membres actifs (propriétaire en tête, puis co-organisateurs, puis le staff). */
export function memberGroups(members: readonly StructureMember[]): MemberGroups {
  return {
    requests: members.filter((m) => m.status === "requested").sort(byPseudo),
    invited: members.filter((m) => m.status === "invited").sort(byPseudo),
    active: members
      .filter((m) => m.status === "active")
      .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || byPseudo(a, b)),
  };
}

/** Mon rôle dans la structure active (membre actif seulement). */
export function myRoleIn(
  memberships: readonly { structureId: string; role: StructureRole; status: string }[] | undefined,
  structureId: string,
): StructureRole | null {
  const found = memberships?.find((m) => m.structureId === structureId && m.status === "active");
  return found?.role ?? null;
}

/**
 * Puis-je modifier ou retirer ce membre ? Le propriétaire gère les co-organisateurs et le staff ; un co-organisateur
 * seulement le staff ; personne ne modifie le propriétaire (l'API refuse aussi : même règle que le site).
 */
export function canManageMember(viewer: StructureRole | null, member: Pick<StructureMember, "role">): boolean {
  if (viewer === "owner") return member.role !== "owner";
  if (viewer === "co_organizer") return member.role === "staff";
  return false;
}

export const isSuspended = (structure: Pick<StructureOrganizer, "verification"> | null | undefined): boolean =>
  structure?.verification === "suspended";

export type InviteDraft = {
  who: string;
  role: "co_organizer" | "staff";
  staffRoles: readonly StaffRole[];
  canDecide: boolean;
};

/**
 * Invitation par pseudo ou par e-mail (une seule zone de saisie, comme le site : un « @ » dit que c'est un e-mail).
 * Seul le propriétaire nomme un co-organisateur : pour un co-organisateur, le rôle retombe sur « staff ».
 */
export function inviteBody(draft: InviteDraft, viewer: StructureRole | null): MemberInvite | { error: string } {
  const who = draft.who.trim();
  if (who === "") return { error: "Indique le pseudo ou l'e-mail du compte." };
  const isEmail = who.includes("@");
  if (!isEmail && (who.length < 3 || who.length > 24)) return { error: "Un pseudo fait de 3 à 24 caractères." };
  const role = viewer === "owner" && draft.role === "co_organizer" ? "co_organizer" : "staff";
  return {
    ...(isEmail ? { email: who } : { pseudo: who }),
    role,
    staffRoles: [...draft.staffRoles],
    canDecide: draft.canDecide,
  };
}

// --- Fiche de la structure --------------------------------------------------------------------------------------

export type StructureForm = {
  name: string;
  description: string;
  addressLine: string;
  postalCode: string;
  city: string;
  departments: string[];
  website: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
};

export function formOfStructure(s: StructureOrganizer): StructureForm {
  return {
    name: s.name,
    description: s.description ?? "",
    addressLine: s.addressLine ?? "",
    postalCode: s.postalCode ?? "",
    city: s.city ?? "",
    departments: [...s.departments],
    website: s.website ?? "",
    instagram: s.socials.instagram ?? "",
    facebook: s.socials.facebook ?? "",
    tiktok: s.socials.tiktok ?? "",
    youtube: s.socials.youtube ?? "",
  };
}

/** Adresse saisie → URL (sans schéma, `https://` est ajouté, comme le site) ; vide → `null`. */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Le corps du `PATCH /structures/:id`, tel que le site l'envoie. */
export function structureUpdateBody(form: StructureForm): StructureUpdate {
  const socials = Object.fromEntries(
    (["instagram", "facebook", "tiktok", "youtube"] as const)
      .map((k) => [k, normalizeUrl(form[k])] as const)
      .filter(([, v]) => v !== null),
  ) as NonNullable<StructureUpdate["socials"]>;
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    addressLine: form.addressLine.trim() || null,
    postalCode: form.postalCode.trim() || null,
    city: form.city.trim() || null,
    departments: [...form.departments],
    website: normalizeUrl(form.website),
    socials,
  };
}

/** La fiche a-t-elle été modifiée ? (le bouton « Enregistrer » ne s'allume qu'alors) */
export function structureFormChanged(form: StructureForm, saved: StructureForm): boolean {
  return JSON.stringify(structureUpdateBody(form)) !== JSON.stringify(structureUpdateBody(saved));
}

export function structureFormIssue(form: StructureForm): string | null {
  return form.name.trim().length < 2 ? "Le nom doit faire au moins 2 caractères." : null;
}

// --- Vérification -----------------------------------------------------------------------------------------------

type VerifState = Pick<StructureVerificationView, "verification">;

/** Les étapes (numéro, justificatif, envoi) s'affichent tant que la structure n'est pas vérifiée (comme le site). */
export const showVerificationSteps = (view: VerifState): boolean => view.verification !== "verified";

/** Un justificatif s'ajoute tant que le dossier n'est pas parti. */
export const canAddDocument = (view: VerifState): boolean =>
  view.verification !== "verified" && view.verification !== "pending";

/** Les justificatifs se retirent tant que le dossier n'est pas parti (comme le site : `unverified` seulement). */
export const canRemoveDocuments = (view: VerifState): boolean => view.verification === "unverified";

/** Le bouton « Envoyer pour vérification » : tant que le dossier n'est ni parti ni accepté. */
export const canShowSubmit = (view: VerifState): boolean =>
  view.verification !== "verified" && view.verification !== "pending";

/** Jours restants avant l'échéance du badge (0 = aujourd'hui ou passée) ; `null` sans échéance. */
export function badgeDaysLeft(badgeExpiresAt: string | null, at: Date): number | null {
  if (!badgeExpiresAt) return null;
  const ms = Date.parse(badgeExpiresAt) - at.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// --- Bannissements, modèles ------------------------------------------------------------------------------------

/** Les plus récents d'abord. */
export const sortedBans = (bans: readonly StructureBan[]): StructureBan[] =>
  [...bans].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export function banIssue(pseudo: string): string | null {
  const p = pseudo.trim();
  if (p.length < 3 || p.length > 24) return "Un pseudo fait de 3 à 24 caractères.";
  return null;
}

export function templateIssue(input: { name: string; body: string }): string | null {
  if (input.name.trim() === "") return "Donne un nom au modèle.";
  if (input.name.trim().length > TEMPLATE_NAME_MAX) return `Le nom fait ${TEMPLATE_NAME_MAX} caractères au plus.`;
  if (input.body.trim() === "") return "Écris le texte du modèle.";
  return null;
}

// --- Export et notes ---------------------------------------------------------------------------------------------

/** Pourquoi l'export ne peut pas partir encore (`null` = on peut) : le motif est obligatoire, comme sur le site. */
export function exportReasonIssue(reason: string): string | null {
  return reason.trim().length < EXPORT_REASON_MIN ? `Le motif demande au moins ${EXPORT_REASON_MIN} caractères.` : null;
}

/** Nom du fichier de l'export, lu dans l'en-tête `content-disposition` de l'API (sinon un nom par défaut). */
export function exportFileName(contentDisposition: string | null): string {
  const found = /filename="([^"]+)"/.exec(contentDisposition ?? "")?.[1] ?? "participants.csv";
  // Le fichier est écrit dans le dossier de l'appli : jamais de chemin dans le nom.
  const safe = found.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return safe === "" || /^\.+$/.test(safe) ? "participants.csv" : safe;
}

export type NotesByPerson = { userId: string; pseudo: string; notes: StructureNoteView[] };

/** Les notes regroupées par personne, dans l'ordre où elles arrivent (les plus récentes d'abord). */
export function groupNotesByPerson(items: readonly StructureNoteView[]): NotesByPerson[] {
  const groups = new Map<string, NotesByPerson>();
  for (const n of items) {
    const g = groups.get(n.subjectUserId) ?? { userId: n.subjectUserId, pseudo: n.subjectPseudo, notes: [] };
    g.notes.push(n);
    groups.set(n.subjectUserId, g);
  }
  return [...groups.values()];
}
