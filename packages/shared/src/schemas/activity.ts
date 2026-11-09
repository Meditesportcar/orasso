import { z } from "zod";

// Activité (la cloche), Demandes et pastilles de la Boîte (lot R7c1). Formes servies par `modules/activity`.

/** `GET /me/activity?cursor=` : 30 lignes brutes par page, regroupées ensuite. */
export const activityQuery = z.object({ cursor: z.string().max(200).optional() });

export const activityDays = ["today", "week", "earlier"] as const;
export type ActivityDay = (typeof activityDays)[number];

/** Une personne citée dans une ligne regroupée (« Kenji_66 et 4 autres »). */
export type ActivityActor = { pseudo: string; avatarUrl: string | null };

/**
 * Une ligne de l'Activité : une notification, ou plusieurs de même `groupKey` le même jour. `ids` : les notifications
 * rassemblées (pour `POST /me/notifications/read`). `data` : sans identifiant de personne ni donnée interne.
 */
export type ActivityItem = {
  id: string;
  ids: string[];
  type: string;
  groupKey: string | null;
  /** Nombre d'occurrences rassemblées (5 flammes = 5), jamais moins d'une. */
  count: number;
  /** Trois personnes au plus, la plus récente d'abord. */
  actors: ActivityActor[];
  title: string;
  body: string;
  latestAt: string;
  read: boolean;
  data: Record<string, unknown>;
  eventId: string | null;
};

export type ActivityGroup = { day: ActivityDay; items: ActivityItem[] };

export type ActivityPage = {
  groups: ActivityGroup[];
  /** Première page seulement : horaires modifiés d'événements à venir où j'ai une place (bandeau moutarde). */
  highlighted: ActivityItem[];
  nextCursor: string | null;
};

export type ActivityCount = { unseen: number };

// --- Demandes ------------------------------------------------------------------------------------------------------

export const requestKinds = [
  "follow",
  "crew",
  "crew_invitation",
  "event_invitation",
  "staff",
  "plate_transfer",
  "contact",
  "partnership",
] as const;
export type RequestKind = (typeof requestKinds)[number];

/** Qui demande : une personne, ou une structure (organisateur, crew). */
export type RequestFrom =
  | { type: "person"; pseudo: string; avatarUrl: string | null }
  | { type: "structure"; name: string; logoUrl: string | null };

/**
 * Une demande en attente. `id` : l'identifiant utilisé par la route d'action existante (`/me/follow-requests/:userId/…`
 * pour `follow`, `/contact-requests/:id/…`, `/plate-transfers/:id/…`, `/me/crew-invitations/:crewId/…`, etc.) ; rien
 * d'autre d'interne. `payload` : liste blanche propre à chaque sorte.
 */
export type RequestItem = {
  kind: RequestKind;
  id: string;
  from: RequestFrom;
  at: string;
  payload: Record<string, unknown>;
};

/** `GET /me/requests?cursor=` : 50 demandes par page, la plus récente d'abord. */
export const requestsQuery = z.object({ cursor: z.string().max(300).optional() });

/** `total` = toutes les demandes en attente (la pastille), pas seulement celles de la page ; `nextCursor` charge la suite. */
export type RequestsPage = { total: number; items: RequestItem[]; nextCursor: string | null };
