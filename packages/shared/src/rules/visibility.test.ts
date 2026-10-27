import { describe, expect, it } from "vitest";

import { notificationTypes } from "../enums";
import { followByInviteSchema, followByQrSchema } from "../schemas/social";
import { followButtonKind, followStatusFor } from "./follows";
import {
  hasPeopleSearchCriteria,
  inJournalWindow,
  journalWindowStart,
  profileAudience,
  profileFields,
} from "./visibility";

const NOW = new Date("2026-10-16T12:00:00Z");
const DAY = 86_400_000;
const base = { isSelf: false, isFollower: false, isOrganizer: false };

describe("audience d'un profil", () => {
  it("public : profil complet ; privé : réduit ; abonné accepté : tout quel que soit le réglage", () => {
    expect(profileAudience({ ...base, visibility: "public" })).toBe("public_full");
    expect(profileAudience({ ...base, visibility: "private" })).toBe("public_limited");
    expect(profileAudience({ ...base, isFollower: true, visibility: "private" })).toBe("follower");
    expect(profileAudience({ ...base, isFollower: true, visibility: "public" })).toBe("follower");
    expect(profileAudience({ ...base, isSelf: true, visibility: "private" })).toBe("self");
  });

  it("l'équipe organisatrice voit tout et seule voit les coordonnées (même abonnée)", () => {
    expect(profileAudience({ ...base, isOrganizer: true, isFollower: true, visibility: "private" })).toBe("organizer");
    for (const audience of ["self", "follower", "public_full", "public_limited"] as const) {
      expect(profileFields(audience).contact).toBe(false);
    }
    expect(profileFields("organizer").contact).toBe(true);
  });

  it("champs : un profil privé étranger ne montre ni bio, ni secteur, ni événements, ni crews, ni fiche complète", () => {
    const limited = profileFields("public_limited");
    expect(Object.values({ ...limited, contact: false }).some(Boolean)).toBe(false);
    for (const audience of ["self", "follower", "public_full", "organizer"] as const) {
      const f = profileFields(audience);
      expect(f.bio && f.departments && f.vehicleDetails && f.upcomingEvents && f.pastEvents && f.crews).toBe(true);
      // Lot R5b : les réseaux suivent le profil complet.
      expect(f.socials).toBe(true);
    }
  });
});

describe("suivre (lot R6b, D37)", () => {
  it("le bouton unique selon mon abonnement, le sien et son réglage", () => {
    const base2 = { canFollow: true, followsMe: false } as const;
    expect(followButtonKind({ ...base2, mine: "none", visibility: "public" })).toBe("follow");
    expect(followButtonKind({ ...base2, mine: "none", visibility: "private" })).toBe("request");
    expect(followButtonKind({ ...base2, mine: "none", followsMe: true, visibility: "public" })).toBe("follow_back");
    expect(followButtonKind({ ...base2, mine: "none", followsMe: true, visibility: "private" })).toBe("follow_back");
    expect(followButtonKind({ ...base2, mine: "accepted", visibility: "private" })).toBe("following");
    expect(followButtonKind({ ...base2, mine: "pending", visibility: "private" })).toBe("requested");
    expect(followButtonKind({ canFollow: false, followsMe: false, mine: "none", visibility: "public" })).toBeNull();
  });

  it("un compte public accepte tout de suite, un compte privé reçoit une demande", () => {
    expect(followStatusFor("public")).toBe("accepted");
    expect(followStatusFor("private")).toBe("pending");
  });

  it("schémas : charge utile du QR de compte et jeton du lien de profil", () => {
    expect(followByQrSchema.safeParse({ payload: "OA1ABCDEFGHIJ" }).success).toBe(true);
    expect(followByQrSchema.safeParse({ payload: "x" }).success).toBe(false);
    expect(followByInviteSchema.safeParse({ token: "abcdefgh" }).success).toBe(true);
    expect(followByInviteSchema.safeParse({ token: "x" }).success).toBe(false);
  });
});

describe("recherche de personnes", () => {
  it("il faut au moins deux caractères ou un filtre", () => {
    expect(hasPeopleSearchCriteria({})).toBe(false);
    expect(hasPeopleSearchCriteria({ q: " k " })).toBe(false);
    expect(hasPeopleSearchCriteria({ q: "ke" })).toBe(true);
    // Lot R2, tour 2 : un filtre seul ne suffit plus (plus aucun annuaire).
    expect(hasPeopleSearchCriteria({ department: "66" } as { q?: string })).toBe(false);
    expect(hasPeopleSearchCriteria({ q: "ke", grade: "route" } as { q?: string })).toBe(true);
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
    for (const t of [
      "friend_request",
      "friend_accepted",
      "friend_going_event",
      "friend_new_vehicle",
      "user_followed",
      "follow_request",
      "follow_accepted",
    ] as const) {
      expect(notificationTypes[t]).toBe("social");
    }
  });
});
