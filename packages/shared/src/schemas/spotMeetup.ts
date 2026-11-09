// Rendez-vous au spot (lot R7i, ARCHITECTURE-R7 § 2.8) : entrées et vues de l'API. Les règles (durée, visibilité,
// phases) sont dans `rules/spotMeetup.ts`. Une vue n'est jamais servie qu'à l'auteur et à ses invités.
import { z } from "zod";

import {
  SPOT_NOTE_MAX,
  SPOT_PLACE_MAX,
  type SpotAnswer,
  type SpotAudience,
  type SpotPhase,
  spotAnswers,
  spotAudiences,
} from "../rules/spotMeetup";

export const spotCreateSchema = z
  .object({
    placeLabel: z.string().trim().min(2, "Dis où").max(SPOT_PLACE_MAX),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z
      .string()
      .trim()
      .max(SPOT_NOTE_MAX)
      .nullish()
      .transform((v) => (v ? v : null)),
    audience: z.enum(spotAudiences),
    crewId: z.uuid().nullish(),
  })
  .superRefine((v, ctx) => {
    if (Number.isNaN(v.startsAt.getTime())) {
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Heure invalide" });
    }
    if (Number.isNaN(v.endsAt.getTime())) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Heure invalide" });
    }
    if (v.audience === "crew" && !v.crewId) {
      ctx.addIssue({ code: "custom", path: ["crewId"], message: "Choisis le crew" });
    }
    if (v.audience === "followers" && v.crewId) {
      ctx.addIssue({ code: "custom", path: ["crewId"], message: "Pas de crew pour « Mes abonnés »" });
    }
  });
export type SpotCreateInput = z.input<typeof spotCreateSchema>;

export const spotReplySchema = z.object({ answer: z.enum(spotAnswers) });
export const spotListQuery = z.object({ cursor: z.string().max(200).optional() });

export type SpotPerson = { pseudo: string; avatarUrl: string | null };

/** Un rendez-vous, vu de son auteur ou d'un invité. `place` est `null` dès qu'il est fini (le lieu n'est plus servi). */
export type SpotMeetupView = {
  id: string;
  author: SpotPerson;
  audience: SpotAudience;
  crew: { id: string; name: string; slug: string } | null;
  place: { label: string; lat: number; lng: number } | null;
  note: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  phase: SpotPhase;
  mine: boolean;
  myAnswer: SpotAnswer | null;
  /** Compteurs et trois premiers « Je viens » : jamais le détail ici (voir `SpotReplies`). */
  yesCount: number;
  maybeCount: number;
  yesPreview: SpotPerson[];
  /** Fini : combien de personnes venaient (un nombre, jamais une liste) ; `null` tant qu'il est en cours. */
  cameCount: number | null;
};

export type SpotReplyItem = { person: SpotPerson; answer: SpotAnswer; answeredAt: string };
export type SpotReplies = {
  items: SpotReplyItem[];
  yesCount: number;
  maybeCount: number;
  nextCursor: string | null;
};

export type SpotIncoming = { items: SpotMeetupView[]; nextCursor: string | null };
export type SpotCrewList = { active: SpotMeetupView[]; past: SpotMeetupView[]; nextCursor: string | null };
/** Ce qu'il faut pour lancer : qui peut être prévenu, et le rendez-vous déjà actif s'il y en a un. */
export type SpotAudiences = {
  followers: number;
  crews: { id: string; name: string; slug: string; members: number }[];
  activeMeetupId: string | null;
};

/** Contenu de la carte du Fil (`kind = spot_meetup`). */
export type SpotFeedPayload = { meetup: SpotMeetupView };

export type { SpotAnswer, SpotAudience, SpotPhase };
