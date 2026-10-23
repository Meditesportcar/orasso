import type { EventCard, EventPublic } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const account = vi.hoisted(() => ({ id: "compte-a" as string | null }));
vi.mock("./api", () => ({ api: { eventBySlug: vi.fn() } }));
vi.mock("./kv", () => ({ cacheScope: () => account.id }));

import {
  clearEventPreviews,
  eventPreview,
  MAX_PREFETCHES,
  MAX_PREVIEWS,
  PREFETCH_TTL_MS,
  PREVIEW_TTL_MS,
  prefetchEvent,
  previewSizes,
  rememberEventCard,
  takePosterRect,
  takePrefetchedEvent,
} from "./eventPreview";

const card = { slug: "nuit-des-moteurs", title: "Nuit des moteurs" } as EventCard;
const rect = { x: 16, y: 300, width: 360, height: 240 };

describe("aperçu de la fiche (lot M3)", () => {
  beforeEach(() => {
    account.id = "compte-a";
    clearEventPreviews();
  });

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

  it("vie privée : la fiche lue par A n'est jamais servie à B (déconnexion, puis autre compte)", () => {
    const fromA = { slug: card.slug, myApplications: [{ id: "cand-a" }] } as unknown as EventPublic;
    prefetchEvent(card.slug, async () => fromA, 1000);
    rememberEventCard(card, rect, 1000);
    // A se déconnecte (la session vide tout), B se connecte et ouvre la même fiche.
    clearEventPreviews();
    account.id = "compte-b";
    expect(takePrefetchedEvent(card.slug, 1100)).toBeNull();
    expect(eventPreview(card.slug, 1100)).toBeNull();
  });

  it("vie privée : sans déconnexion vidée, un autre compte ne lit pas non plus ce qui n'est pas à lui", () => {
    const fromA = { slug: card.slug } as EventPublic;
    prefetchEvent(card.slug, async () => fromA, 1000);
    rememberEventCard(card, rect, 1000);
    account.id = "compte-b";
    expect(takePrefetchedEvent(card.slug, 1100)).toBeNull();
    expect(eventPreview(card.slug, 1100)).toBeNull();
    expect(takePosterRect(card.slug)).toBeNull();
  });

  it("mémoire bornée : entrées expirées retirées, plafonds tenus", () => {
    const load = async (s: string) => ({ slug: s }) as EventPublic;
    for (let i = 0; i < MAX_PREFETCHES + 5; i++) prefetchEvent(`e${i}`, load, 1000);
    for (let i = 0; i < MAX_PREVIEWS + 5; i++) rememberEventCard({ ...card, slug: `e${i}` }, null, 1000);
    expect(previewSizes()).toEqual({ previews: MAX_PREVIEWS, prefetches: MAX_PREFETCHES });
    // Les plus anciennes sont parties, les plus récentes restent.
    expect(takePrefetchedEvent("e0", 1000)).toBeNull();
    expect(takePrefetchedEvent(`e${MAX_PREFETCHES + 4}`, 1000)).not.toBeNull();
    // Expirées : retirées au prochain préchargement.
    prefetchEvent("tard", load, 1001 + PREFETCH_TTL_MS);
    expect(previewSizes().prefetches).toBe(1);
  });
});
