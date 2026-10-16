import { describe, expect, it } from "vitest";

import { notificationTypes } from "../enums";
import { friendRequestByQrSchema, friendRequestCreateSchema } from "../schemas/social";
import {
  FRIEND_DECLINE_COOLDOWN_DAYS,
  type FriendshipRowLike,
  friendRequestOutcome,
  friendshipState,
  hasPeopleSearchCriteria,
  inJournalWindow,
  journalWindowStart,
  profileAudience,
  profileFields,
} from "./visibility";

const NOW = new Date("2026-10-16T12:00:00Z");
const DAY = 86_400_000;
const base = { isSelf: false, isFriend: false, isOrganizer: false };

describe("audience d'un profil", () => {
  it("public : profil complet ; privé : réduit ; ami : tout quel que soit le réglage", () => {
    expect(profileAudience({ ...base, visibility: "public" })).toBe("public_full");
    expect(profileAudience({ ...base, visibility: "private" })).toBe("public_limited");
    expect(profileAudience({ ...base, isFriend: true, visibility: "private" })).toBe("friend");
    expect(profileAudience({ ...base, isSelf: true, visibility: "private" })).toBe("self");
  });

  it("l'organisateur voit tout et seul voit les coordonnées (même s'il est ami)", () => {
    expect(profileAudience({ ...base, isOrganizer: true, isFriend: true, visibility: "private" })).toBe("organizer");
    for (const audience of ["self", "friend", "public_full", "public_limited"] as const) {
      expect(profileFields(audience).contact).toBe(false);
    }
    expect(profileFields("organizer").contact).toBe(true);
  });

  it("champs : un profil privé étranger ne montre ni bio, ni secteur, ni événements, ni crews, ni fiche complète", () => {
    const limited = profileFields("public_limited");
    expect(Object.values({ ...limited, contact: false }).some(Boolean)).toBe(false);
    for (const audience of ["self", "friend", "public_full", "organizer"] as const) {
      const f = profileFields(audience);
      expect(f.bio && f.departments && f.vehicleDetails && f.upcomingEvents && f.pastEvents && f.crews).toBe(true);
    }
  });
});

describe("demande d'ami", () => {
  const row = (r: Partial<FriendshipRowLike>): FriendshipRowLike => ({
    requesterId: "a",
    addresseeId: "b",
    status: "pending",
    respondedAt: null,
    ...r,
  });

  it("état de la relation vu de chaque côté", () => {
    expect(friendshipState(null, "a")).toBe("none");
    expect(friendshipState(row({}), "a")).toBe("pending_out");
    expect(friendshipState(row({}), "b")).toBe("pending_in");
    expect(friendshipState(row({ status: "accepted" }), "b")).toBe("friends");
    expect(friendshipState(row({ status: "declined" }), "a")).toBe("none");
  });

  it("aucune relation : créer ; en attente (dans un sens ou l'autre) ou amis : refusé", () => {
    expect(friendRequestOutcome(null, "a", NOW)).toEqual({ kind: "create" });
    expect(friendRequestOutcome(row({}), "a", NOW)).toEqual({ kind: "error", code: "friendship_exists" });
    expect(friendRequestOutcome(row({}), "b", NOW)).toEqual({ kind: "error", code: "friendship_exists" });
    expect(friendRequestOutcome(row({ status: "accepted" }), "a", NOW)).toEqual({
      kind: "error",
      code: "already_friends",
    });
  });

  it("refus : le demandeur attend 30 jours, puis la ligne repasse en attente ; le destinataire peut demander tout de suite", () => {
    const declinedAt = new Date(NOW.getTime() - 3 * DAY);
    const declined = row({ status: "declined", respondedAt: declinedAt });
    expect(friendRequestOutcome(declined, "a", NOW)).toEqual({ kind: "error", code: "recently_declined" });
    expect(friendRequestOutcome(declined, "b", NOW)).toEqual({ kind: "reopen", flip: true });
    const old = row({ status: "declined", respondedAt: new Date(NOW.getTime() - FRIEND_DECLINE_COOLDOWN_DAYS * DAY) });
    expect(friendRequestOutcome(old, "a", NOW)).toEqual({ kind: "reopen", flip: false });
    const almost = row({
      status: "declined",
      respondedAt: new Date(NOW.getTime() - FRIEND_DECLINE_COOLDOWN_DAYS * DAY + 1000),
    });
    expect(friendRequestOutcome(almost, "a", NOW)).toEqual({ kind: "error", code: "recently_declined" });
  });

  it("schémas : pseudo valide, message borné à 200 caractères, charge utile du QR", () => {
    expect(friendRequestCreateSchema.safeParse({ pseudo: "Kenji_66" }).success).toBe(true);
    expect(friendRequestCreateSchema.safeParse({ pseudo: "x" }).success).toBe(false);
    expect(friendRequestCreateSchema.safeParse({ pseudo: "Kenji_66", message: "a".repeat(201) }).success).toBe(false);
    expect(friendRequestByQrSchema.safeParse({ payload: "OA1ABCDEFGHIJ" }).success).toBe(true);
    expect(friendRequestByQrSchema.safeParse({ payload: "x" }).success).toBe(false);
  });
});

describe("recherche de personnes", () => {
  it("il faut au moins deux caractères ou un filtre", () => {
    expect(hasPeopleSearchCriteria({})).toBe(false);
    expect(hasPeopleSearchCriteria({ q: " k " })).toBe(false);
    expect(hasPeopleSearchCriteria({ q: "ke" })).toBe(true);
    expect(hasPeopleSearchCriteria({ department: "66" })).toBe(true);
    expect(hasPeopleSearchCriteria({ generationId: "g" })).toBe(true);
  });
});

describe("Journal", () => {
  it("fenêtre de 7 jours sauf les éléments non lus", () => {
    expect(journalWindowStart(NOW)).toEqual(new Date(NOW.getTime() - 7 * DAY));
    const old = new Date(NOW.getTime() - 9 * DAY);
    expect(inJournalWindow({ createdAt: old, readAt: null }, NOW)).toBe(true);
    expect(inJournalWindow({ createdAt: old, readAt: new Date(NOW.getTime() - 8 * DAY) }, NOW)).toBe(false);
    expect(inJournalWindow({ createdAt: new Date(NOW.getTime() - 2 * DAY), readAt: NOW }, NOW)).toBe(true);
  });

  it("types sociaux déclarés dans la famille social", () => {
    for (const t of ["friend_request", "friend_accepted", "friend_going_event", "friend_new_vehicle"] as const) {
      expect(notificationTypes[t]).toBe("social");
    }
  });
});
