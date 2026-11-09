import { describe, expect, it } from "vitest";

import { distanceKm } from "../geo";
import { presenceLabels } from "../labels/presence.fr";
import { presenceInputSchema } from "../schemas/presence";
import { canVote } from "./audiencePrize";
import {
  inPresenceWindow,
  inZone,
  liveCountsVisible,
  liveDay,
  livePhase,
  myPresenceOf,
  PRESENCE_DEFAULT_RADIUS_M,
  PRESENCE_MAX_ACCURACY_M,
  PRESENCE_OPENS_BEFORE_MS,
  PRESENCE_RADIUS_BOUNDS,
  type PresenceContext,
  paidOrassoEntry,
  presenceRadiusM,
  presenceRefusal,
  presenceWindow,
  validPresenceRadius,
} from "./presence";

const startsAt = new Date("2026-11-08T08:00:00Z");
const endsAt = new Date("2026-11-08T21:00:00Z");
const lieu = { lat: 42.7881, lng: 3.0389 };
/** Un point à `meters` mètres plein nord du lieu. */
const north = (meters: number) => ({ lat: lieu.lat + meters / 111_195, lng: lieu.lng });

const ok: PresenceContext = {
  event: { status: "published", startsAt, endsAt, ...lieu },
  now: new Date("2026-11-08T10:00:00Z"),
  holdsVehicleSlot: false,
  alreadyPresent: false,
  point: lieu,
  accuracyM: 20,
};

describe("présence par GPS : constantes", () => {
  it("valeurs de l'architecture", () => {
    expect(PRESENCE_DEFAULT_RADIUS_M).toBe(300);
    expect(PRESENCE_RADIUS_BOUNDS).toEqual([50, 2000]);
    expect(PRESENCE_MAX_ACCURACY_M).toBe(150);
    expect(PRESENCE_OPENS_BEFORE_MS).toBe(30 * 60_000);
  });

  it("rayon : celui de l'organisateur, sinon 300 m ; bornes entières", () => {
    expect(presenceRadiusM({ presenceRadiusM: null })).toBe(300);
    expect(presenceRadiusM({})).toBe(300);
    expect(presenceRadiusM({ presenceRadiusM: 400 })).toBe(400);
    expect(validPresenceRadius(50)).toBe(true);
    expect(validPresenceRadius(2000)).toBe(true);
    expect(validPresenceRadius(49)).toBe(false);
    expect(validPresenceRadius(2001)).toBe(false);
    expect(validPresenceRadius(300.5)).toBe(false);
  });
});

describe("présence par GPS : fenêtre", () => {
  it("de 30 minutes avant le début à la fin (fin exclue)", () => {
    const w = presenceWindow({ startsAt, endsAt });
    expect(w.from.toISOString()).toBe("2026-11-08T07:30:00.000Z");
    expect(w.to).toEqual(endsAt);
    expect(inPresenceWindow({ startsAt, endsAt }, new Date("2026-11-08T07:29:59Z"))).toBe(false);
    expect(inPresenceWindow({ startsAt, endsAt }, new Date("2026-11-08T07:30:00Z"))).toBe(true);
    expect(inPresenceWindow({ startsAt, endsAt }, new Date("2026-11-08T20:59:59Z"))).toBe(true);
    expect(inPresenceWindow({ startsAt, endsAt }, endsAt)).toBe(false);
  });
});

describe("présence par GPS : zone", () => {
  it("la tolérance est le rayon plus la précision, bord inclus", () => {
    const e = { ...lieu, presenceRadiusM: null };
    expect(distanceKm(north(250), lieu) * 1000).toBeCloseTo(250, 0);
    expect(inZone(north(250), 0, e)).toBe(true);
    expect(inZone(north(299), 0, e)).toBe(true);
    expect(inZone(north(301), 0, e)).toBe(false);
    // 330 m avec une incertitude de 40 m : dans la zone ; à 345 m, non.
    expect(inZone(north(330), 40, e)).toBe(true);
    expect(inZone(north(345), 40, e)).toBe(false);
    // Le bord exact (rayon + précision) est dedans.
    const edge = { ...lieu, presenceRadiusM: 400 };
    const meters = 400 + 60;
    expect(inZone(north(meters - 0.5), 60, edge)).toBe(true);
    expect(inZone(north(meters + 0.5), 60, edge)).toBe(false);
  });

  it("zone de l'organisateur : le rayon saisi remplace 300 m", () => {
    expect(inZone(north(500), 0, { ...lieu, presenceRadiusM: null })).toBe(false);
    expect(inZone(north(500), 0, { ...lieu, presenceRadiusM: 600 })).toBe(true);
  });

  it("sans position du lieu ou précision absente", () => {
    expect(inZone(lieu, 10, { lat: null, lng: null })).toBe(false);
    expect(inZone(north(310), undefined, { ...lieu })).toBe(false);
    expect(inZone(north(310), null, { ...lieu })).toBe(false);
    expect(inZone(north(310), -50, { ...lieu })).toBe(false);
  });
});

describe("présence par GPS : refus, dans l'ordre", () => {
  it("rien à refuser dans la zone, pendant l'événement", () => {
    expect(presenceRefusal(ok)).toBeNull();
    expect(presenceRefusal({ ...ok, point: north(280), accuracyM: undefined })).toBeNull();
    // Avant le début, dans la demi-heure d'ouverture.
    expect(presenceRefusal({ ...ok, now: new Date("2026-11-08T07:45:00Z") })).toBeNull();
  });

  it("closed : hors des heures ou événement non publié", () => {
    expect(presenceRefusal({ ...ok, now: new Date("2026-11-08T07:00:00Z") })).toBe("closed");
    expect(presenceRefusal({ ...ok, now: endsAt })).toBe("closed");
    expect(presenceRefusal({ ...ok, event: { ...ok.event, status: "cancelled" } })).toBe("closed");
    expect(presenceRefusal({ ...ok, event: { ...ok.event, status: "draft" } })).toBe("closed");
  });

  it("use_qr : un exposant se fait scanner", () => {
    expect(presenceRefusal({ ...ok, holdsVehicleSlot: true })).toBe("use_qr");
  });

  it("already_present : une validation par compte", () => {
    expect(presenceRefusal({ ...ok, alreadyPresent: true })).toBe("already_present");
  });

  it("gps_imprecise : au-delà de 150 m, 150 m accepté", () => {
    expect(presenceRefusal({ ...ok, accuracyM: PRESENCE_MAX_ACCURACY_M })).toBeNull();
    expect(presenceRefusal({ ...ok, accuracyM: PRESENCE_MAX_ACCURACY_M + 0.1 })).toBe("gps_imprecise");
    expect(presenceRefusal({ ...ok, accuracyM: 5000 })).toBe("gps_imprecise");
  });

  it("no_zone : le lieu n'a pas de position", () => {
    expect(presenceRefusal({ ...ok, event: { ...ok.event, lat: null, lng: null } })).toBe("no_zone");
  });

  it("out_of_zone : trop loin pour le rayon et la précision", () => {
    expect(presenceRefusal({ ...ok, point: north(2000) })).toBe("out_of_zone");
    expect(presenceRefusal({ ...ok, point: north(330), accuracyM: 20 })).toBe("out_of_zone");
    expect(presenceRefusal({ ...ok, point: north(330), accuracyM: 40 })).toBeNull();
  });

  it("l'ordre : fermé avant exposant avant déjà présent avant imprécis avant zone", () => {
    const worst: PresenceContext = {
      ...ok,
      now: new Date("2026-11-09T10:00:00Z"),
      holdsVehicleSlot: true,
      alreadyPresent: true,
      point: north(5000),
      accuracyM: 999,
      event: { ...ok.event, lat: null, lng: null },
    };
    const open = { ...worst, now: ok.now };
    expect(presenceRefusal(worst)).toBe("closed");
    expect(presenceRefusal(open)).toBe("use_qr");
    const notExhibitor = { ...open, holdsVehicleSlot: false };
    expect(presenceRefusal(notExhibitor)).toBe("already_present");
    const notYet = { ...notExhibitor, alreadyPresent: false };
    expect(presenceRefusal(notYet)).toBe("gps_imprecise");
    const precise = { ...notYet, accuracyM: 10 };
    expect(presenceRefusal(precise)).toBe("no_zone");
    expect(presenceRefusal({ ...precise, event: ok.event })).toBe("out_of_zone");
  });

  it("chaque refus a son libellé", () => {
    for (const code of [
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
    ] as const) {
      expect(presenceLabels.errors[code].length).toBeGreaterThan(10);
    }
  });
});

describe("présence par GPS : accès et billets (décision de Damien, 09/11)", () => {
  const access = (publicAccess: string, ...ticketPricesCents: number[]) => ({ publicAccess, ticketPricesCents });

  it("entrée libre ou réservation gratuite : acceptée, avec ou sans billet", () => {
    expect(presenceRefusal({ ...ok, access: access("free") })).toBeNull();
    expect(presenceRefusal({ ...ok, access: access("free_reservation", 0), ticket: "free" })).toBeNull();
    // paid_orasso dont le seul type est à 0 € : gratuit
    expect(presenceRefusal({ ...ok, access: access("paid_orasso", 0), ticket: "none" })).toBeNull();
  });

  it("paid_orasso : billet payant scanné, sans billet ticket_required, billet gratuit accepté", () => {
    const paid = access("paid_orasso", 1500);
    expect(presenceRefusal({ ...ok, access: paid, ticket: "paid" })).toBe("scan_ticket");
    expect(presenceRefusal({ ...ok, access: paid, ticket: "none" })).toBe("ticket_required");
    expect(presenceRefusal({ ...ok, access: paid })).toBe("ticket_required");
    // Réservation gratuite émise avant une hausse du tarif : le montant enregistré fait foi.
    expect(presenceRefusal({ ...ok, access: paid, ticket: "free" })).toBeNull();
  });

  it("paid_orasso sans aucun type de billet : payant (ventes coupées comprises)", () => {
    expect(paidOrassoEntry([])).toBe(true);
    expect(paidOrassoEntry([0])).toBe(false);
    expect(paidOrassoEntry([0, 500])).toBe(true);
    expect(presenceRefusal({ ...ok, access: access("paid_orasso"), ticket: "none" })).toBe("ticket_required");
  });

  it("paid_external : refusé à tous, pay_at_entry ; closed : closed_to_public", () => {
    expect(presenceRefusal({ ...ok, access: access("paid_external"), ticket: "none" })).toBe("pay_at_entry");
    expect(presenceRefusal({ ...ok, access: access("paid_external", 0), ticket: "free" })).toBe("pay_at_entry");
    expect(presenceRefusal({ ...ok, access: access("closed") })).toBe("closed_to_public");
  });

  it("l'ordre : fermé (heures) puis exposant puis accès, avant déjà présent et la zone", () => {
    const late = new Date("2026-11-09T10:00:00Z");
    expect(presenceRefusal({ ...ok, now: late, access: access("closed") })).toBe("closed");
    expect(presenceRefusal({ ...ok, holdsVehicleSlot: true, access: access("closed") })).toBe("use_qr");
    expect(presenceRefusal({ ...ok, alreadyPresent: true, point: north(5000), access: access("paid_external") })).toBe(
      "pay_at_entry",
    );
  });

  it("événement sur plusieurs jours : l'accès s'applique dans la plage d'un jour, la pause reste fermée", () => {
    const days = [
      { startsAt: new Date("2026-11-08T08:00:00Z"), endsAt: new Date("2026-11-08T18:00:00Z") },
      { startsAt: new Date("2026-11-10T08:00:00Z"), endsAt: new Date("2026-11-10T18:00:00Z") },
    ];
    const multi = { ...ok, event: { ...ok.event, endsAt: days[1]!.endsAt, days }, access: access("paid_orasso", 1000) };
    expect(presenceRefusal({ ...multi, ticket: "paid" })).toBe("scan_ticket");
    expect(presenceRefusal({ ...multi, ticket: "none", now: new Date("2026-11-10T09:00:00Z") })).toBe(
      "ticket_required",
    );
    expect(presenceRefusal({ ...multi, ticket: "none", now: new Date("2026-11-09T09:00:00Z") })).toBe("closed");
    expect(presenceRefusal({ ...multi, ticket: "free", now: new Date("2026-11-10T09:00:00Z") })).toBeNull();
  });
});

describe("présence par GPS : corps de la demande", () => {
  it("lat, lng, précision facultative ; rien d'autre", () => {
    expect(presenceInputSchema.safeParse({ lat: 42.78, lng: 3.03 }).success).toBe(true);
    expect(presenceInputSchema.safeParse({ lat: 42.78, lng: 3.03, accuracyM: 12.5 }).success).toBe(true);
    expect(presenceInputSchema.safeParse({ lat: 91, lng: 3 }).success).toBe(false);
    expect(presenceInputSchema.safeParse({ lat: 42, lng: 181 }).success).toBe(false);
    expect(presenceInputSchema.safeParse({ lat: 42, lng: 3, accuracyM: -1 }).success).toBe(false);
    expect(presenceInputSchema.safeParse({ lat: "42", lng: 3 }).success).toBe(false);
    expect(presenceInputSchema.safeParse({ lat: Number.NaN, lng: 3 }).success).toBe(false);
    expect(presenceInputSchema.safeParse({ lat: 42, lng: 3, deviceName: "x" }).success).toBe(false);
  });
});

describe("le direct : phase, jour, compteurs", () => {
  it("phase", () => {
    expect(livePhase({ startsAt, endsAt }, new Date("2026-11-08T07:59:59Z"))).toBe("before");
    expect(livePhase({ startsAt, endsAt }, startsAt)).toBe("running");
    expect(livePhase({ startsAt, endsAt }, new Date("2026-11-08T20:59:59Z"))).toBe("running");
    expect(livePhase({ startsAt, endsAt }, endsAt)).toBe("after");
  });

  it("jour : 1 sur 1 sans jours déclarés, le jour en cours ou le dernier commencé sinon", () => {
    const day = (n: number) => ({
      startsAt: new Date(`2026-11-${String(7 + n).padStart(2, "0")}T08:00:00Z`),
      endsAt: new Date(`2026-11-${String(7 + n).padStart(2, "0")}T21:00:00Z`),
    });
    const days = [day(0), day(1), day(2), day(3)];
    expect(liveDay({}, new Date("2026-11-08T10:00:00Z"))).toEqual({ dayIndex: 1, dayCount: 1 });
    expect(liveDay({ days: [day(0)] }, new Date("2026-11-08T10:00:00Z"))).toEqual({ dayIndex: 1, dayCount: 1 });
    expect(liveDay({ days }, new Date("2026-11-07T07:00:00Z"))).toEqual({ dayIndex: 1, dayCount: 4 });
    expect(liveDay({ days }, new Date("2026-11-08T10:00:00Z"))).toEqual({ dayIndex: 2, dayCount: 4 });
    // La nuit entre le jour 2 et le jour 3 : toujours « jour 2 ».
    expect(liveDay({ days }, new Date("2026-11-09T02:00:00Z"))).toEqual({ dayIndex: 2, dayCount: 4 });
    expect(liveDay({ days }, new Date("2026-11-10T10:00:00Z"))).toEqual({ dayIndex: 4, dayCount: 4 });
    expect(liveDay({ days }, new Date("2026-12-10T10:00:00Z"))).toEqual({ dayIndex: 4, dayCount: 4 });
    // L'ordre de la liste ne compte pas.
    expect(liveDay({ days: [...days].reverse() }, new Date("2026-11-09T10:00:00Z"))).toEqual({
      dayIndex: 3,
      dayCount: 4,
    });
  });

  it("règle des absents : « N sur place, sur M retenues » pendant l'événement seulement", () => {
    const counts = { onSiteCount: 11, acceptedCount: 14 };
    expect(liveCountsVisible("running", "published", counts)).toEqual(counts);
    expect(liveCountsVisible("before", "published", counts)).toEqual({ onSiteCount: null, acceptedCount: null });
    expect(liveCountsVisible("after", "published", counts)).toEqual({ onSiteCount: null, acceptedCount: null });
    expect(liveCountsVisible("running", "cancelled", counts)).toEqual({ onSiteCount: null, acceptedCount: null });
    expect(liveCountsVisible("running", "draft", counts)).toEqual({ onSiteCount: null, acceptedCount: null });
  });

  it("ma présence : entrée du véhicule, billet contrôlé, GPS", () => {
    expect(myPresenceOf({ checkedIn: false, ticketScanned: false, gps: false })).toBeNull();
    expect(myPresenceOf({ checkedIn: true, ticketScanned: true, gps: true })).toBe("checked_in");
    expect(myPresenceOf({ checkedIn: false, ticketScanned: true, gps: true })).toBe("ticket");
    expect(myPresenceOf({ checkedIn: false, ticketScanned: false, gps: true })).toBe("gps");
  });

  it("les mots", () => {
    expect(presenceLabels.onSite(11, 14)).toBe("11 sur place, sur 14 retenues");
    expect(presenceLabels.onSite(1, 1)).toBe("1 sur place, sur 1 retenue");
    expect(presenceLabels.summaryTotal(23)).toBe("23 utilisateurs d'Orasso présents");
  });
});

describe("droit de vote d'un présent par GPS", () => {
  const vote = {
    status: "published",
    endsAt,
    firstCheckinAt: new Date("2026-11-08T09:00:00Z"),
    vehiclesCheckedIn: 3,
  };
  const nobody = { checkedInAt: null, ticketScannedAt: null, staffPresent: false };
  const now = new Date("2026-11-08T12:00:00Z");

  it("une présence GPS compte comme les autres preuves", () => {
    expect(canVote(nobody, vote, now)).toBe("not_checked_in");
    expect(canVote({ ...nobody, gpsPresentAt: null }, vote, now)).toBe("not_checked_in");
    expect(canVote({ ...nobody, gpsPresentAt: new Date("2026-11-08T11:00:00Z") }, vote, now)).toBeNull();
  });

  it("elle ne rouvre pas un vote clos ni n'ouvre un vote pas encore ouvert", () => {
    const gps = { ...nobody, gpsPresentAt: new Date("2026-11-08T11:00:00Z") };
    expect(canVote(gps, vote, endsAt)).toBe("vote_closed");
    expect(canVote(gps, { ...vote, vehiclesCheckedIn: 1 }, now)).toBe("vote_not_open");
  });
});
