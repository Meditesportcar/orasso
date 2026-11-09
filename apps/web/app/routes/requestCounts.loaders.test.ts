// Lot R7c2, tour 2 : un compteur de demandes **inconnu** n'est pas zéro. Quand `GET /me/inbox/summary` échoue, les chargeurs
// de l'Activité, des Demandes et des Messages se rabattent sur la liste des demandes ; sans elle non plus, le compteur
// reste `null` (la ligne garde son accès, l'écran affiche « Réessayer »), jamais 0.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = new Map<string, unknown>();
const FAIL = Symbol("panne");

vi.mock("../lib/api.server", () => {
  const answer = (path: string) => {
    const key = [...calls.keys()].find((k) => path.startsWith(k));
    const value = key === undefined ? FAIL : calls.get(key);
    return value === FAIL
      ? { ok: false as const, status: 503, error: { code: "internal", message: "En panne" } }
      : { ok: true as const, status: 200, data: value };
  };
  return {
    requireMe: async () => ({ user: { id: "u1" }, profile: {}, personas: [] }),
    api: async (_r: Request, path: string) => answer(path),
    apiOrThrow: async (_r: Request, path: string) => {
      const res = answer(path);
      if (res.ok) return res.data;
      throw new Response(res.error.message, { status: res.status });
    },
  };
});

const requestOf = (path: string) => new Request(`http://site.test${path}`);
const page = (items: { kind: string; id: string }[], total = items.length) => ({
  total,
  items: items.map((i) => ({
    ...i,
    from: { type: "person", pseudo: "X", avatarUrl: null },
    at: "2026-11-09T00:00:00.000Z",
    payload: {},
  })),
  nextCursor: null,
});
const activityPage = { groups: [], highlighted: [], nextCursor: null };
const summary = (over: Partial<{ pendingRequests: number; contact: number }> = {}) => ({
  unreadMessages: 0,
  unseenActivity: 0,
  pendingRequests: over.pendingRequests ?? 0,
  requests: { contact: over.contact ?? 0 },
});

beforeEach(() => calls.clear());

describe("compteurs de demandes inconnus (chargeurs du site)", () => {
  it("Activité : résumé en panne, la liste des demandes donne le nombre", async () => {
    const { loader } = await import("./app-activite");
    calls.set("/me/activity", activityPage);
    calls.set("/me/inbox/summary", FAIL);
    calls.set(
      "/me/requests",
      page([
        { kind: "follow", id: "a" },
        { kind: "contact", id: "b" },
        { kind: "staff", id: "c" },
      ]),
    );
    const data = (await loader({ request: requestOf("/app/activite") } as never)) as {
      activityRequests: number | null;
    };
    expect(data.activityRequests).toBe(2);
  });

  it("Activité : résumé et liste en panne, le compteur est inconnu (null), pas 0", async () => {
    const { loader } = await import("./app-activite");
    calls.set("/me/activity", activityPage);
    calls.set("/me/inbox/summary", FAIL);
    calls.set("/me/requests", FAIL);
    const data = (await loader({ request: requestOf("/app/activite") } as never)) as {
      activityRequests: number | null;
    };
    expect(data.activityRequests).toBeNull();
  });

  it("Activité : résumé disponible, il prime", async () => {
    const { loader } = await import("./app-activite");
    calls.set("/me/activity", activityPage);
    calls.set("/me/inbox/summary", summary({ pendingRequests: 3, contact: 1 }));
    calls.set("/me/requests", FAIL);
    const data = (await loader({ request: requestOf("/app/activite") } as never)) as {
      activityRequests: number | null;
    };
    expect(data.activityRequests).toBe(2);
  });

  it("Messages : résumé en panne, les demandes de contact reçues donnent le nombre ; sinon inconnu", async () => {
    const { loader } = await import("./app-messages");
    calls.set("/me/conversations", { items: [], nextCursor: null });
    calls.set("/me/inbox/summary", FAIL);
    calls.set("/me/contact-requests", { items: [{ direction: "in" }, { direction: "out" }, { direction: "in" }] });
    expect(
      ((await loader({ request: requestOf("/app/messages") } as never)) as { messageRequests: number | null })
        .messageRequests,
    ).toBe(2);
    calls.set("/me/contact-requests", FAIL);
    expect(
      ((await loader({ request: requestOf("/app/messages") } as never)) as { messageRequests: number | null })
        .messageRequests,
    ).toBeNull();
  });

  it("Demandes : résumé en panne, les nombres viennent de la liste ; la ligne des demandes de message suit", async () => {
    const { loader } = await import("./app-activite-demandes");
    calls.set("/me/inbox/summary", FAIL);
    calls.set(
      "/me/requests",
      page([
        { kind: "follow", id: "a" },
        { kind: "contact", id: "b" },
      ]),
    );
    const data = (await loader({ request: requestOf("/app/activite/demandes") } as never)) as {
      items: { kind: string }[];
      activityRequests: number | null;
      messageRequests: number;
    };
    expect(data.items.map((i) => i.kind)).toEqual(["follow"]);
    expect(data.activityRequests).toBe(1);
    expect(data.messageRequests).toBe(1);
  });
});
