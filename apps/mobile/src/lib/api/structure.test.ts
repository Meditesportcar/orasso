// Lot 35a : le client de la structure appelle les mêmes routes que le site, avec les mêmes corps. Le client HTTP est
// remplacé : on vérifie le chemin, la méthode et le corps envoyés, pas le réseau.
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn(async (_path: string, _options?: unknown) => ({}) as unknown);
vi.mock("../http", () => ({ request: (path: string, options?: unknown) => request(path, options) }));

import { structureApi } from "./structure";

const S = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  request.mockClear();
});

const last = () => {
  const call = request.mock.calls.at(-1);
  return { path: call?.[0], options: (call?.[1] ?? {}) as Record<string, unknown> };
};

describe("fiche, logo, vérification", () => {
  it("lit et enregistre la fiche", async () => {
    await structureApi.orgStructure(S);
    expect(last()).toEqual({ path: `/api/structures/${S}`, options: {} });
    await structureApi.updateStructure(S, { name: "MSC" });
    expect(last()).toEqual({ path: `/api/structures/${S}`, options: { method: "PATCH", body: { name: "MSC" } } });
  });

  it("envoie le logo et les justificatifs en formulaire", async () => {
    const form = new FormData();
    await structureApi.uploadLogo(S, form);
    expect(last().path).toBe(`/api/structures/${S}/logo`);
    expect(last().options).toMatchObject({ method: "POST", form });
    await structureApi.addVerificationDocument(S, form);
    expect(last().path).toBe(`/api/structures/${S}/verification/documents`);
    await structureApi.removeVerificationDocument(S, "doc1");
    expect(last().path).toBe(`/api/structures/${S}/verification/documents/doc1`);
    expect(last().options.method).toBe("DELETE");
  });

  it("contrôle le numéro puis soumet le dossier", async () => {
    await structureApi.checkRegistry(S, "W123456789");
    expect(last().options).toMatchObject({ method: "POST", body: { number: "W123456789" } });
    await structureApi.submitVerification(S);
    expect(last().path).toBe(`/api/structures/${S}/verification/submit`);
    expect(last().options.method).toBe("POST");
  });
});

describe("partenaires, membres, demandes de staff", () => {
  it("accepte ou retire un partenaire par son slug", async () => {
    await structureApi.acceptPartner(S, "garage du port");
    expect(last().path).toBe(`/api/structures/${S}/partners/garage%20du%20port`);
    expect(last().options.method).toBe("PUT");
    await structureApi.dropPartner(S, "garage-du-port");
    expect(last().options.method).toBe("DELETE");
  });

  it("invite, modifie et retire un membre", async () => {
    const body = { pseudo: "Julie_66", role: "staff" as const, staffRoles: ["scan" as const], canDecide: false };
    await structureApi.inviteMember(S, body);
    expect(last()).toEqual({ path: `/api/structures/${S}/members`, options: { method: "POST", body } });
    await structureApi.updateMember(S, "u1", { staffRoles: ["shop"], canDecide: true });
    expect(last()).toEqual({
      path: `/api/structures/${S}/members/u1`,
      options: { method: "PATCH", body: { staffRoles: ["shop"], canDecide: true } },
    });
    await structureApi.removeMember(S, "u1");
    expect(last().options.method).toBe("DELETE");
  });

  it("accepte une demande de staff avec ses rôles, la refuse sans corps", async () => {
    await structureApi.acceptStaffRequest(S, "u2", { staffRoles: ["scan"], canDecide: false });
    expect(last()).toEqual({
      path: `/api/structures/${S}/members/u2/accept`,
      options: { method: "POST", body: { staffRoles: ["scan"], canDecide: false } },
    });
    await structureApi.declineStaffRequest(S, "u2");
    expect(last()).toEqual({ path: `/api/structures/${S}/members/u2/decline`, options: { method: "POST" } });
  });

  it("relance tous les membres du staff sans réponse d'un événement", async () => {
    await structureApi.remindAllStaff(E);
    expect(last()).toEqual({ path: `/api/events/${E}/staff/remind`, options: { method: "POST", body: {} } });
  });
});

describe("bannissements, modèles, notes", () => {
  it("bannit avec un motif et lève le bannissement", async () => {
    await structureApi.ban(S, "Kenji_66", "Insultes");
    expect(last()).toEqual({
      path: `/api/structures/${S}/bans`,
      options: { method: "POST", body: { pseudo: "Kenji_66", reason: "Insultes" } },
    });
    await structureApi.unban(S, "u3");
    expect(last()).toEqual({ path: `/api/structures/${S}/bans/u3`, options: { method: "DELETE" } });
  });

  it("crée, modifie et supprime un modèle", async () => {
    const body = { kind: "message" as const, name: "Rappel", subject: null, body: "Bonjour" };
    await structureApi.createTemplate(S, body);
    expect(last()).toEqual({ path: `/api/structures/${S}/templates`, options: { method: "POST", body } });
    await structureApi.updateTemplate(S, "t1", { name: "Rappel 2" });
    expect(last()).toEqual({
      path: `/api/structures/${S}/templates/t1`,
      options: { method: "PATCH", body: { name: "Rappel 2" } },
    });
    await structureApi.deleteTemplate(S, "t1");
    expect(last().options.method).toBe("DELETE");
  });

  it("cherche, écrit, modifie et supprime des notes", async () => {
    await structureApi.notes(S, { q: "Ken", limit: 50 });
    expect(last().path).toBe(`/api/structures/${S}/notes?q=Ken&limit=50`);
    await structureApi.notes(S);
    expect(last().path).toBe(`/api/structures/${S}/notes`);
    await structureApi.createNote(S, { pseudo: "Kenji_66", eventId: E, body: "Arrivé en retard" });
    expect(last().options).toMatchObject({ method: "POST", body: { pseudo: "Kenji_66", eventId: E } });
    await structureApi.updateNote("n1", "Corrigé");
    expect(last()).toEqual({
      path: "/api/structure-notes/n1",
      options: { method: "PATCH", body: { body: "Corrigé" } },
    });
    await structureApi.deleteNote("n1");
    expect(last()).toEqual({ path: "/api/structure-notes/n1", options: { method: "DELETE" } });
  });
});
