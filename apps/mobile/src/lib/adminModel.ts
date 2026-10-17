// Administration dans l'appli (lot 35d) : logique pure, sans React, testée seule. Rôles qui voient l'administration,
// sections de chaque onglet, validations de saisie (motifs, dates au clavier), liens profonds des alertes et listes
// administrables. Aucune règle métier : droits, motifs et traces restent ceux de l'API.
import {
  type AdminOverview,
  fromWallTime,
  adminAppLabels as L,
  adminNavLabels as N,
  type PlatformRole,
  wallTime,
} from "@orasso/shared";

import type { AppPersonaEntry } from "./personaModel";

export type AdminRole = "super_admin" | "moderator";

/** Rôle d'administration d'un compte (`GET /me` → `profile.platformRole`), `null` pour un compte ordinaire. */
export function adminRoleOf(role: PlatformRole | undefined | null): AdminRole | null {
  return role === "super_admin" || role === "moderator" ? role : null;
}

/** Identifiant de la casquette Administration (une seule par compte). */
export const ADMIN_ENTRY_ID = "admin";

/** La ligne de la casquette Administration ; `null` pour un compte ordinaire. Le nom suit le rôle. */
export function adminEntryOf(role: PlatformRole | undefined | null): AppPersonaEntry | null {
  const admin = adminRoleOf(role);
  if (!admin) return null;
  return {
    kind: "admin",
    id: ADMIN_ENTRY_ID,
    label: admin === "moderator" ? L.kindModerator : L.kind,
    logoUrl: null,
    badge: 0,
  };
}

// --- Sections ---------------------------------------------------------------------------------------------------------

export type AdminGroup = "queues" | "registries" | "manage";

export type AdminSection = {
  id: string;
  label: string;
  /** Écran de la casquette (`/(admin)/…`). */
  route: string;
  group: AdminGroup;
  /** Compteur de l'accueil (`GET /admin/overview`). */
  count?: keyof AdminOverview;
  /** Visible du modérateur (la file des signalements seulement : l'API refuse le reste). */
  moderator?: boolean;
};

export const adminSections: AdminSection[] = [
  {
    id: "verification",
    label: N.verification,
    route: "/(admin)/verification",
    group: "queues",
    count: "structuresPending",
  },
  {
    id: "signalements",
    label: N.reports,
    route: "/(admin)/signalements",
    group: "queues",
    count: "reportsPending",
    moderator: true,
  },
  { id: "sanctions", label: N.sanctions, route: "/(admin)/sanctions", group: "queues", count: "sanctionsContested" },
  {
    id: "certifications",
    label: N.certifications,
    route: "/(admin)/certifications",
    group: "queues",
    count: "certificationsPending",
  },
  {
    id: "transferts",
    label: N.transfers,
    route: "/(admin)/transferts",
    group: "queues",
    count: "plateTransfersArbitrated",
  },
  {
    id: "contestations",
    label: N.contests,
    route: "/(admin)/contestations",
    group: "queues",
    count: "malusContestsEscalated",
  },
  { id: "assistance", label: N.assistance, route: "/(admin)/assistance", group: "queues", count: "assistanceOpen" },
  { id: "badges", label: N.badges, route: "/(admin)/badges", group: "queues", count: "badgesExpiring" },
  { id: "pros-a-verifier", label: "Pros à vérifier", route: "/(admin)/pros", group: "queues", count: "prosToVerify" },
  { id: "autres", label: "Véhicules « Autre »", route: "/(admin)/vehicules", group: "queues", count: "otherVehicles" },
  {
    id: "newsletters",
    label: "Newsletters planifiées",
    route: "/(admin)/newsletter",
    group: "queues",
    count: "newslettersScheduled",
  },
  { id: "utilisateurs", label: N.users, route: "/(admin)/utilisateurs", group: "registries" },
  { id: "structures", label: N.structures, route: "/(admin)/structures", group: "registries" },
  { id: "pros", label: N.pros, route: "/(admin)/pros", group: "registries" },
  { id: "vehicules", label: N.vehicles, route: "/(admin)/vehicules", group: "registries" },
  { id: "journal", label: N.audit, route: "/(admin)/journal", group: "registries" },
  { id: "reglages", label: N.settings, route: "/(admin)/parametres", group: "manage" },
  { id: "newsletter", label: N.newsletter, route: "/(admin)/newsletter", group: "manage" },
  { id: "sponsorises", label: N.sponsored, route: "/(admin)/sponsorises", group: "manage" },
  { id: "horloge", label: L.sectionClock, route: "/(admin)/horloge", group: "manage" },
];

/** Les sections d'un groupe que ce rôle voit (la barre de l'horloge n'existe que si l'API la propose). */
export function sectionsOf(group: AdminGroup, role: AdminRole, clockAvailable: boolean): AdminSection[] {
  return adminSections.filter((s) => {
    if (s.group !== group) return false;
    if (role === "moderator" && !s.moderator) return false;
    if (s.id === "horloge" && !clockAvailable) return false;
    return true;
  });
}

/** Compteur d'une section dans l'accueil (`undefined` : pas de compteur). */
export function countOf(section: AdminSection, overview: AdminOverview | null): number | undefined {
  if (!section.count || !overview) return undefined;
  return overview[section.count];
}

/** Total de ce qui attend (l'accueil dit « Rien à traiter » à zéro). */
export function overviewTotal(overview: AdminOverview): number {
  return Object.values(overview).reduce((n, v) => n + (typeof v === "number" ? v : 0), 0);
}

/** Onglets de la casquette (identifiant, route de l'écran) selon le rôle : le modérateur n'a que ses files. */
export function adminTabRoutes(role: AdminRole): Record<string, string> {
  return role === "moderator"
    ? { accueil: "home", signalements: "reports" }
    : { accueil: "home", signalements: "reports", registres: "registries", gestion: "manage" };
}

// --- Saisies ----------------------------------------------------------------------------------------------------------

/** Motif obligatoire des gestes sensibles : 5 caractères au moins (comme `adminReasonSchema`). */
export function reasonIssue(reason: string, min = 5): string | null {
  return reason.trim().length >= min
    ? null
    : min === 5
      ? L.reasonRequired
      : `Indique le motif (${min} caractères au moins).`;
}

/** Note exigée pour un refus (structure, certification) ; facultative sinon. */
export function refusalNoteIssue(note: string): string | null {
  return note.trim() === "" ? L.noteRequiredRefuse : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** « 25/12/2026 » → « 2026-12-25 » ; `null` si la date n'existe pas. */
export function parseDayFr(raw: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** « 2026-12-25 » → « 25/12/2026 ». */
export function dayToFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** « 25/12/2026 18:30 » (heure de Paris) → instant ISO ; `null` si illisible. */
export function parseDateTimeFr(raw: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2})[:h](\d{2})\s*$/.exec(raw);
  if (!m) return null;
  const [day, month, year, hour, minute] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  if (!parseDayFr(`${day}/${month}/${year}`) || hour > 23 || minute > 59) return null;
  return fromWallTime({ year, month, day, hour, minute }).toISOString();
}

/** Instant ISO → « 25/12/2026 18:30 » (heure de Paris). */
export function dateTimeToFr(iso: string | Date): string {
  const w = wallTime(typeof iso === "string" ? new Date(iso) : iso);
  return `${pad(w.day)}/${pad(w.month)}/${w.year} ${pad(w.hour)}:${pad(w.minute)}`;
}

/** Les bornes d'un filtre de journal, avec les heures de la page du site (jour entier, heure de Paris). */
export function auditRange(from: string, to: string): { from?: string; to?: string; invalid: boolean } {
  const out: { from?: string; to?: string; invalid: boolean } = { invalid: false };
  for (const [raw, key, hm] of [
    [from, "from", "00:00"],
    [to, "to", "23:59"],
  ] as const) {
    if (raw.trim() === "") continue;
    const iso = parseDateTimeFr(`${raw.trim()} ${hm}`);
    if (!iso) out.invalid = true;
    else out[key] = iso;
  }
  return out;
}

/** « 66, 11;2a » → ["66", "11", "2A"]. */
export function departmentsOf(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
}

/** Quota de messages aux abonnés : vide = valeur par défaut (`null`), sinon un entier de 0 à 30 (`undefined` = invalide). */
export function parseQuota(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 0 && n <= 30 ? n : undefined;
}

/** Entier relatif saisi au clavier (« -5 », « +10 ») ; `null` si ce n'est pas un entier non nul. */
export function parsePoints(raw: string): number | null {
  const t = raw.trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return n === 0 ? null : n;
}

/** Année facultative d'une génération (vide = pas d'année) ; `undefined` si illisible. */
export function parseYear(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  return /^\d{4}$/.test(t) ? Number(t) : undefined;
}

// --- Listes administrables --------------------------------------------------------------------------------------------

/** Les codes d'une liste dans l'ordre d'affichage : ceux qui sont proposés d'abord (dans leur ordre), les autres ensuite. */
export function orderedCodes<T extends string>(all: readonly T[], chosen: readonly T[]): T[] {
  const on = chosen.filter((c) => all.includes(c));
  return [...on, ...all.filter((c) => !on.includes(c))];
}

/** Coche ou décoche un code : coché, il se range à la fin des codes proposés. */
export function toggleCode<T extends string>(chosen: readonly T[], code: T, on: boolean): T[] {
  const rest = chosen.filter((c) => c !== code);
  return on ? [...rest, code] : rest;
}

/** Monte (`-1`) ou descend (`1`) un code proposé d'un cran. */
export function moveCode<T extends string>(chosen: readonly T[], code: T, delta: -1 | 1): T[] {
  const at = chosen.indexOf(code);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= chosen.length) return [...chosen];
  const next = [...chosen];
  next.splice(at, 1);
  next.splice(to, 0, code);
  return next;
}

// --- État d'un compte -------------------------------------------------------------------------------------------------

/** État d'un compte du registre (« Supprimé », « Banni », « Suspendu »), `null` si le compte est actif. */
export function userStateOf(
  u: { deletedAt: string | null; bannedAt: string | null; suspendedUntil: string | null },
  at: Date,
): string | null {
  if (u.deletedAt) return "Supprimé";
  if (u.bannedAt) return "Banni";
  if (u.suspendedUntil && new Date(u.suspendedUntil) > at) return "Suspendu";
  return null;
}

// --- Newsletter -------------------------------------------------------------------------------------------------------

/** Un brouillon ou une newsletter planifiée se modifie ; ensuite le texte est figé. */
export function newsletterEditable(status: string | undefined): boolean {
  return !status || status === "draft" || status === "scheduled";
}

/** Peut-on mettre l'envoi en pause (planifié ou en cours) ? */
export function newsletterPausable(status: string | undefined): boolean {
  return status === "scheduled" || status === "sending";
}

// --- Liens profonds ---------------------------------------------------------------------------------------------------

const ADMIN_LINKS: Record<string, string> = {
  "/admin/signalements": "/(admin)/signalements",
  "/admin/assistance": "/(admin)/assistance",
  "/admin/sanctions": "/(admin)/sanctions",
  "/admin/verification": "/(admin)/verification",
  "/admin/contestations": "/(admin)/contestations",
};

/**
 * Lien d'une notification envoyée à l'équipe (« Ouvrir la file », « Ouvrir les demandes d'aide ») → écran de la casquette
 * Administration. Un chemin inconnu ne mène nulle part (jamais un chemin libre).
 */
export function adminLinkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  return ADMIN_LINKS[path] ?? null;
}

// --- Mode assistance --------------------------------------------------------------------------------------------------

/** Identifiant d'une structure survolée : la ligne de casquette reprend son nom, `assisted` la distingue des siennes. */
export type AssistedStructure = { id: string; name: string; slug: string };

/** Motif d'une demande d'aide : 10 caractères au moins (comme `assistanceRequestCreateSchema`). */
export function assistanceMessageIssue(message: string): string | null {
  return message.trim().length >= 10 ? null : L.assistanceMessageInvalid;
}
