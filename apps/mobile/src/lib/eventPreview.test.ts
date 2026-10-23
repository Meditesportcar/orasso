import type { EventCard, EventPublic } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: { eventBySlug: vi.fn() } }));

import {
  clearEventPreviews,
  eventPreview,
  PREFETCH_TTL_MS,
  PREVIEW_TTL_MS,
  prefetchEvent,
  rememberEventCard,
  takePosterRect,
  takePrefetchedEvent,
} from "./eventPreview";

const card = { slug: "nuit-des-moteurs", title: "Nuit des moteurs" } as EventCard;
const rect = { x: 16, y: 300, width: 360, height: 240 };

describe("aperçu de la fiche (lot M3)", () => {
  beforeEach(() => clearEventPreviews());

  it("rend la carte touchée, puis l'oublie au-delà de sa durée", () => {
    rememberEventCard(card, rect, 1000);
    expect(eventPreview(card.slug, 1000 + PREVIEW_TTL_MS)?.card).toBe(card);
    expect(eventPreview(card.slug, 1001 + PREVIEW_TTL_MS)).toBeNull();
    expect(eventPreview("autre", 1000)).toBeNull();
  });

  it("donne la place de l'affiche une seule fois (pas de transition au retour)", () => {
    rememberEventCard(card, rect, 1000);
    expect(takePosterRect(card.slug)).toEqual(rect);
    expect(takePosterRect(card.slug)).toBeNull();
    expect(eventPreview(card.slug, 1000)?.card).toBe(card);
  });

  it("reprend la lecture partie au toucher, une seule fois et tant qu'elle est fraîche", async () => {
    const event = { slug: card.slug } as EventPublic;
    const load = vi.fn(async () => event);
    prefetchEvent(card.slug, load, 1000);
    prefetchEvent(card.slug, load, 1500);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(takePrefetchedEvent(card.slug, 2000)).resolves.toBe(event);
    expect(takePrefetchedEvent(card.slug, 2000)).toBeNull();
    prefetchEvent(card.slug, load, 3000);
    expect(takePrefetchedEvent(card.slug, 3001 + PREFETCH_TTL_MS)).toBeNull();
  });

  it("oublie une lecture en échec (la fiche relance la sienne)", async () => {
    const load = vi.fn(async () => {
      throw new Error("réseau");
    });
    prefetchEvent(card.slug, load, 1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(takePrefetchedEvent(card.slug, 1000)).toBeNull();
  });
});
