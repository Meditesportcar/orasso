// Lot 35b : le client de l'assistant d'événement appelle les mêmes routes que le site, avec les mêmes corps. Le client
// HTTP est remplacé : on vérifie le chemin, la méthode et le corps envoyés, pas le réseau.
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn(async (_path: string, _options?: unknown) => ({}) as unknown);
vi.mock("../http", () => ({ request: (path: string, options?: unknown) => request(path, options) }));

import { eventEditorApi as api } from "./eventEditor";
import { invitationsApi } from "./invitations";
import { triageApi } from "./triage";

const S = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  request.mockClear();
});

const last = () => {
  const call = request.mock.calls.at(-1);
  return { path: call?.[0], options: (call?.[1] ?? {}) as Record<string, unknown> };
};

describe("création et modification", () => {
  it("crée dans la structure, modifie l'événement, enregistre les jours", async () => {
    await api.createEvent(S, { title: "Rasso" });
    expect(last()).toMatchObject({
      path: `/api/structures/${S}/events`,
      options: { method: "POST", body: { title: "Rasso" } },
    });
    await api.updateEvent(E, { title: "Rasso 2" });
    expect(last()).toMatchObject({
      path: `/api/events/${E}`,
      options: { method: "PATCH", body: { title: "Rasso 2" } },
    });
    await api.putEventDays(E, { days: [] });
    expect(last()).toMatchObject({ path: `/api/events/${E}/days`, options: { method: "PUT", body: { days: [] } } });
  });

  it("zones, affiche et recherche d'adresse", async () => {
    const zone = { code: "A", name: "Alpha", capacity: null, position: 0 };
    await api.addZone(E, zone);
    expect(last()).toMatchObject({ path: `/api/events/${E}/zones`, options: { method: "POST", body: zone } });
    await api.updateZone(E, "z1", zone);
    expect(last()).toMatchObject({ path: `/api/events/${E}/zones/z1`, options: { method: "PATCH" } });
    await api.deleteZone(E, "z1");
    expect(last()).toMatchObject({ path: `/api/events/${E}/zones/z1`, options: { method: "DELETE" } });
    const form = new FormData();
    await api.uploadPoster(E, form);
    expect(last()).toMatchObject({ path: `/api/events/${E}/poster`, options: { method: "POST", form } });
    await api.geocode("1 quai de l'Hérault Argelès");
    expect(last().path).toBe("/api/geocode?q=1%20quai%20de%20l'H%C3%A9rault%20Argel%C3%A8s");
  });
});

describe("publier, dupliquer, récurrence, invitations, décision groupée", () => {
  it("appelle les routes de la page de l'événement", async () => {
    await api.publishEvent(E);
    expect(last()).toMatchObject({ path: `/api/events/${E}/publish`, options: { method: "POST" } });
    await api.duplicateEvent(E);
    expect(last()).toMatchObject({ path: `/api/events/${E}/duplicate`, options: { method: "POST" } });
    const rule = { kind: "weekly" as const, interval: 2, count: 3 };
    await api.createRecurrence(E, rule);
    expect(last()).toMatchObject({ path: `/api/events/${E}/recurrence`, options: { method: "POST", body: { rule } } });
  });

  it("invite (véhicules, édition passée) et retire une invitation", async () => {
    await invitationsApi.inviteToEvent(E, { pseudos: [], emails: [], vehicleIds: ["v1"], message: null });
    expect(last()).toMatchObject({ path: `/api/events/${E}/invitations`, options: { body: { vehicleIds: ["v1"] } } });
    await invitationsApi.inviteFromEvent(E, "src", "Salut");
    expect(last()).toMatchObject({
      path: `/api/events/${E}/invitations/from-event`,
      options: { body: { sourceEventId: "src", message: "Salut" } },
    });
    await invitationsApi.invitationCandidates(E);
    expect(last().path).toBe(`/api/events/${E}/invitations/candidates`);
    await api.removeInvitation(E, "i1");
    expect(last()).toMatchObject({ path: `/api/events/${E}/invitations/i1`, options: { method: "DELETE" } });
  });

  it("tranche plusieurs candidatures d'un coup avec les motifs", async () => {
    await triageApi.triageDecideMany(E, { ids: ["a", "b"], decision: "refuse", reasons: ["full"], sendReasons: true });
    expect(last()).toMatchObject({
      path: `/api/events/${E}/applications/decide-many`,
      options: { method: "POST", body: { ids: ["a", "b"], decision: "refuse", reasons: ["full"] } },
    });
  });
});
