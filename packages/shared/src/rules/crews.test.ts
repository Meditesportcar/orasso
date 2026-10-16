import { describe, expect, it } from "vitest";

import { systemMessageText } from "../labels/messaging.fr";
import { activeApplicationStatuses, canTransition, capacityStatuses } from "./applicationTransitions";
import { crewConfirmDeadline, crewJoinOutcome, crewViewerState } from "./crews";

const at = new Date("2026-10-16T10:00:00Z");
const daysAgo = (n: number) => new Date(at.getTime() - n * 86_400_000);

describe("transitions de l'inscription en crew (§ 4.2)", () => {
  it("autorisées", () => {
    expect(canTransition(null, "awaiting_member", "user")).toBe(true);
    expect(canTransition("awaiting_member", "pending", "user")).toBe(true);
    expect(canTransition("awaiting_member", "withdrawn", "user")).toBe(true);
    expect(canTransition("awaiting_member", "withdrawn", "system")).toBe(true);
    expect(canTransition("awaiting_member", "cancelled", "system")).toBe(true);
  });

  it("interdites : l'organisation ne tranche pas une venue non confirmée, le système ne confirme pas", () => {
    for (const actor of ["organizer", "staff", "admin"] as const) {
      expect(canTransition("awaiting_member", "accepted", actor)).toBe(false);
      expect(canTransition("awaiting_member", "waitlisted", actor)).toBe(false);
      expect(canTransition("awaiting_member", "refused", actor)).toBe(false);
      expect(canTransition(null, "awaiting_member", actor)).toBe(false);
    }
    expect(canTransition("awaiting_member", "pending", "system")).toBe(false);
    expect(canTransition("awaiting_member", "accepted", "user")).toBe(false);
    expect(canTransition("awaiting_member", "expired", "system")).toBe(false);
    expect(canTransition("pending", "awaiting_member", "user")).toBe(false);
  });

  it("`awaiting_member` est active (véhicule bloqué) mais ne prend pas de place", () => {
    expect(activeApplicationStatuses).toContain("awaiting_member");
    expect(capacityStatuses as readonly string[]).not.toContain("awaiting_member");
  });
});

describe("échéance de confirmation (S17)", () => {
  it("72 h après l'inscription, plafonnées au verrouillage", () => {
    const created = new Date("2026-10-10T10:00:00Z");
    expect(crewConfirmDeadline(created, new Date("2026-10-20T16:00:00Z")).toISOString()).toBe(
      "2026-10-13T10:00:00.000Z",
    );
    expect(crewConfirmDeadline(created, new Date("2026-10-11T16:00:00Z")).toISOString()).toBe(
      "2026-10-11T16:00:00.000Z",
    );
  });
});

describe("demandes et invitations", () => {
  const row = (
    status: Parameters<typeof crewJoinOutcome>[0] extends infer R ? NonNullable<R>["status"] : never,
    respondedAt: Date | null,
    wasInvitation = false,
  ) => ({
    status,
    respondedAt,
    wasInvitation,
  });

  it("ouvrir, accepter le pas de l'autre, refuser les doublons", () => {
    expect(crewJoinOutcome(null, "request", at)).toEqual({ kind: "open" });
    expect(crewJoinOutcome(row("left", daysAgo(1)), "request", at)).toEqual({ kind: "open" });
    expect(crewJoinOutcome(row("active", null), "invite", at)).toEqual({ kind: "error", code: "already_member" });
    expect(crewJoinOutcome(row("requested", null), "request", at)).toEqual({ kind: "error", code: "already_pending" });
    expect(crewJoinOutcome(row("invited", null, true), "request", at)).toEqual({ kind: "accept" });
    expect(crewJoinOutcome(row("requested", null), "invite", at)).toEqual({ kind: "accept" });
  });

  it("30 jours pour celui qui insiste seulement", () => {
    // Demande refusée par le chef : la personne attend 30 jours, le chef peut l'inviter.
    expect(crewJoinOutcome(row("declined", daysAgo(5)), "request", at)).toEqual({ kind: "error", code: "cooldown" });
    expect(crewJoinOutcome(row("declined", daysAgo(31)), "request", at)).toEqual({ kind: "open" });
    expect(crewJoinOutcome(row("declined", daysAgo(5)), "invite", at)).toEqual({ kind: "open" });
    // Invitation refusée : le chef attend, la personne peut demander.
    expect(crewJoinOutcome(row("declined", daysAgo(5), true), "invite", at)).toEqual({
      kind: "error",
      code: "cooldown",
    });
    expect(crewJoinOutcome(row("declined", daysAgo(5), true), "request", at)).toEqual({ kind: "open" });
    // Retiré : ne redemande pas avant 30 jours, le chef peut le réinviter.
    expect(crewJoinOutcome(row("removed", daysAgo(5)), "request", at)).toEqual({ kind: "error", code: "cooldown" });
    expect(crewJoinOutcome(row("removed", daysAgo(5)), "invite", at)).toEqual({ kind: "open" });
  });

  it("refus silencieux : la demande reste « envoyée » pour le demandeur pendant 30 jours", () => {
    const declined = {
      status: "declined" as const,
      respondedAt: daysAgo(3),
      role: "member" as const,
      requestedByMe: true,
    };
    expect(crewViewerState(declined, at)).toBe("requested");
    expect(crewViewerState({ ...declined, respondedAt: daysAgo(40) }, at)).toBe("none");
    expect(crewViewerState({ ...declined, requestedByMe: false }, at)).toBe("none");
    expect(crewViewerState({ status: "active", respondedAt: null, role: "leader", requestedByMe: false }, at)).toBe(
      "leader",
    );
  });
});

describe("messages d'information de la discussion", () => {
  it("libellé avec le pseudo, « Un membre » si effacé, « Information » si inconnu", () => {
    expect(systemMessageText(JSON.stringify({ code: "crew_member_joined", pseudo: "Lea_11" }))).toBe(
      "Lea_11 a rejoint le crew.",
    );
    expect(systemMessageText(JSON.stringify({ code: "crew_member_left", pseudo: null }))).toBe(
      "Un membre a quitté le crew.",
    );
    expect(systemMessageText("pas du json")).toBe("Information");
    expect(systemMessageText(JSON.stringify({ code: "inconnu" }))).toBe("Information");
  });
});
