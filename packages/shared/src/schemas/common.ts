import { z } from "zod";

/** Codes d'erreur de l'API (ARCHITECTURE.md § 5.1) : `{"error":{"code","message","details"}}`. */
export const errorCodes = [
  "validation_error",
  "unauthenticated",
  "two_factor_required",
  "forbidden",
  "not_found",
  "conflict",
  // Lot R8k1 : commentaires coupés sur une publication (409).
  "comments_off",
  "invalid_transition",
  "event_full",
  "plate_taken",
  "offer_expired",
  "locked",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "internal",
  // Lot 15 : compte et sécurité.
  "referral_not_applicable",
  "structure_owner",
  "invalid_credentials",
  // Lot 17 : amis.
  "friendship_exists",
  "already_friends",
  // Lot 18 : messagerie.
  "not_friends",
  "contact_request_exists",
  "use_direct",
  "conversation_closed",
  // Lot 20 : communication de l'organisateur.
  "follower_quota_exceeded",
  // Lot 32 : modération.
  "suspended",
  "banned",
  "already_reported",
  "already_handled",
  // Lot 25 : événement privé sur invitation.
  "invite_only",
  "invitation_required",
  // Lot 33 : administration (mode assistance, interrupteurs, actions sur soi-même).
  "assistance_required",
  "signup_closed",
  "providers_disabled",
  "self_action",
  // Lot 26 : événements sur plusieurs jours (jour qui a des candidatures, retrait refusé).
  "day_in_use",
  // Lot 36 : badge « pro vérifié » jamais sans SIRET trouvé et actif dans le registre public.
  "siret_missing",
  "siret_not_matched",
  "registry_unavailable",
  // Lot 45 : accréditation presse.
  "accreditation_closed",
  "press_quota_reached",
  "accreditation_deadline_passed",
  // Lot 47 : case « J'ai vu » de l'horaire d'arrivée des exposants non cochée.
  "arrival_not_seen",
  // Lot 49 : prix du public.
  "vote_closed",
  "vote_not_open",
  "not_checked_in",
  "own_vehicle",
  // Lot R7l1 : votes à thème (modifier un vote ouvert, candidats, lancement, QR d'accès).
  "vote_locked",
  "vote_fixed",
  "vote_has_voices",
  "vote_not_manual",
  "expired_qr",
  "hand_first_entry",
  "event_not_published",
  "opens_at_invalid",
  "not_hand",
  "not_enough_candidates",
  "event_over",
  "invalid_qr",
  "other_event",
  "too_many_votes",
  "restore_has_voices",
  // Lot R7e1 : publication du Fil sans décision de plaque pour une photo.
  "plate_decision_required",
  // Lot R7e1 (tour 2) : pseudo réservé au compte officiel d'Orasso.
  "pseudo_reserved",

  // Lot R7f1 : stories (plaque non décidée, story réservée au crew).

  "crew_only",
  "not_implemented",
  "author_only",
  "story_not_ready",
  "private_author",
  "no_masked_photo",
  "vote_open",
  "no_ranking",
  // Lot R7f1 (tour 2) : plafond de stories vivantes, page sans messagerie pour répondre à une story.
  "too_many_stories",
  "reply_unavailable",
  // Lot R7g : story vidéo trop longue, vidéo qui n'est pas en H.264.
  "too_long",
  "codec",
  "share_private",
  "not_tagged",
  "already_shared",
  // Lot R8n1 : réglages de notification d'un événement où la personne n'a pas de place.
  "no_place",

  // Lot R7d1 : présence par GPS (refus de la validation, dans l'ordre de la règle).
  "closed",
  "use_qr",
  "scan_ticket",
  "ticket_required",
  "pay_at_entry",
  "closed_to_public",
  "already_present",
  "gps_imprecise",
  "out_of_zone",
  "no_zone",
  // Lot R7i : un seul rendez-vous au spot actif par personne.
  "meetup_active",

  // Lot R7m1 : partenariats pro ↔ passionné.
  "not_verified",
  "not_published",
  "subscription_required",
  "partnership_exists",
  "partnership_cooldown",
  // Lot R7m2 : « Collaboration commerciale ».
  "commercial_locked",
  "commercial_conflict",
  "commercial_video",
  // Lot R8a1 : publier au nom d'une casquette, rattachement, « Info importante ».
  "persona_forbidden",
  "follow_private_account",
  "event_not_attachable",
  "important_requires_event",
  "important_quota",
  "photo_required",
  // Lot R8o : collaboration (co-auteur).
  "coauthor_self",
  "coauthor_important",
  "coauthor_unavailable",
  "coauthor_cannot_see",
  "coauthor_quota",
  "coauthor_provider",
  "coauthor_closed",
] as const;

/** Lot 47 : réponse du candidat au créneau d'arrivée des exposants (candidature seule, chef de crew, membre). */
export const arrivalAnswerFields = {
  /** « J'ai vu » : obligatoire quand l'événement a un créneau pour les exposants, ignorée sinon. */
  arrivalSeen: z.boolean().optional(),
  /** « J'arriverai vers 19 h 30 à cause du travail » (200 caractères au plus ; vide = pas de note). */
  arrivalNote: z.string().trim().max(200).nullish(),
};
export type ErrorCode = (typeof errorCodes)[number];
export type ApiError = { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };

/** Date ISO 8601 en entrée (avec fuseau), convertie en Date. */
export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

/** Texte facultatif : chaîne vide → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Pagination par curseur : `?limit=20&cursor=<opaque>` → `{items, nextCursor}`. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
/** Lot R2 : `total`, le nombre de résultats en tout, seulement quand la liste le demande (`withTotal=1`). */
export type Page<T> = { items: T[]; nextCursor: string | null; total?: number };
