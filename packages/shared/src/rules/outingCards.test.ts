import { describe, expect, it } from "vitest";

import { MAX_NEXT_OUTINGS, type OutingCardApplication, type OutingCardTicket, pickNextOutings } from "./outingCards";

const NOW = new Date("2026-11-10T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
const app = (id: string, status: string, days: number): OutingCardApplication => ({
  id,
  status,
  event: { id: `e-${id}`, slug: `s-${id}`, startsAt: day(days) },
});
const ticket = (id: string, days: number, status = "valid", slug = `s-${id}`): OutingCardTicket => ({
  id,
  status,
  event: { id: `e-${id}`, slug, startsAt: day(days), endsAt: day(days + 0.2) },
});
const ids = (c: { id: string }[]) => c.map((x) => x.id);

describe("cartes de « Prochaine sortie » (R8e1, tour 2)", () => {
  it("exposant : la place retenue d'abord, puis les autres par date", () => {
    const cards = pickNextOutings({
      applications: [app("p", "pending", 1), app("a", "accepted", 6), app("w", "waitlisted", 3)],
      tickets: [ticket("t", 2)],
      exhibitor: true,
      now: NOW,
    });
    expect(ids(cards)).toEqual(["a", "p", "t", "w"]);
  });

  it("sans place retenue : la première candidature en cours ; refusées et retirées ne sont pas des cartes", () => {
    const cards = pickNextOutings({
      applications: [app("r", "refused", 1), app("w", "withdrawn", 1), app("o", "offered", 4), app("p", "pending", 2)],
      tickets: [],
      exhibitor: true,
      now: NOW,
    });
    expect(ids(cards)).toEqual(["o", "p"]);
  });

  it("une place retenue à J+6 reste la carte principale même derrière six billets plus proches", () => {
    const tickets = [1, 2, 3, 4, 5, 6, 7].map((n) => ticket(`t${n}`, n));
    const cards = pickNextOutings({ applications: [app("a", "accepted", 6)], tickets, exhibitor: true, now: NOW });
    expect(cards).toHaveLength(MAX_NEXT_OUTINGS);
    expect(cards[0]).toMatchObject({ kind: "application", id: "a", eventId: "e-a" });
    expect(ids(cards).slice(1)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  it("un billet contrôlé reste une carte tant que l'événement n'est pas fini ; fini ou annulé : non", () => {
    const cards = pickNextOutings({
      applications: [],
      tickets: [ticket("u", 0.1, "used"), ticket("c", 1, "cancelled"), ticket("over", -3, "used"), ticket("v", 2)],
      exhibitor: false,
      now: NOW,
    });
    expect(cards.map((c) => [c.id, c.status])).toEqual([
      ["v", "valid"],
      ["u", "used"],
    ]);
  });

  it("un billet d'un événement où une place retenue donne l'accès est caché ; en attente, il reste", () => {
    const accepted = pickNextOutings({
      applications: [app("a", "accepted", 3)],
      tickets: [ticket("t", 3, "valid", "s-a")],
      exhibitor: true,
      now: NOW,
    });
    expect(ids(accepted)).toEqual(["a"]);
    const pending = pickNextOutings({
      applications: [app("a", "pending", 3)],
      tickets: [ticket("t", 3, "valid", "s-a")],
      exhibitor: true,
      now: NOW,
    });
    expect(ids(pending).sort()).toEqual(["a", "t"]);
  });

  it("visiteur : son premier billet valable en tête, puis le reste par date", () => {
    const cards = pickNextOutings({
      applications: [app("p", "pending", 1)],
      tickets: [ticket("t2", 5), ticket("t1", 3)],
      exhibitor: false,
      now: NOW,
    });
    expect(ids(cards)).toEqual(["t1", "p", "t2"]);
  });
});
