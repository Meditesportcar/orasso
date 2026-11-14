import { describe, expect, it } from "vitest";

import { requestRowCounts, requestRowShown } from "../messaging";
import {
  COAUTHOR_CAPTION_PREVIEW_MAX,
  canDeletePost,
  canInvite,
  canRespond,
  canWithdraw,
  captionPreview,
  coauthorShown,
  inviteRefusal,
  signature,
  withLabel,
} from "./coauthors";
import { draftFromBody } from "./feedPublish";

const base = {
  authorKey: "s:11111111-1111-4111-8111-111111111111",
  publisherKey: "u:abc",
  targetKey: "p:22222222-2222-4222-8222-222222222222",
  targetKind: "pro" as const,
  important: false,
};

describe("coauthors : règles pures", () => {
  it("seule une invitation acceptée se montre", () => {
    expect(coauthorShown("accepted")).toBe(true);
    for (const s of ["pending", "declined", "withdrawn"] as const) expect(coauthorShown(s)).toBe(false);
  });

  it("invite : refus de soi-même, de sa page, d'une info importante, d'un prestataire", () => {
    expect(canInvite(base)).toBe(true);
    expect(inviteRefusal({ ...base, targetKey: base.authorKey, targetKind: "structure" })).toBe("self");
    expect(inviteRefusal({ ...base, targetKey: "u:abc", targetKind: "user" })).toBe("self");
    expect(inviteRefusal({ ...base, important: true })).toBe("important");
    expect(inviteRefusal({ ...base, targetKind: "provider" })).toBe("provider");
  });

  it("répondre : seulement à une invitation en attente", () => {
    expect(canRespond("pending")).toBe(true);
    for (const s of ["accepted", "declined", "withdrawn"] as const) expect(canRespond(s)).toBe(false);
  });

  it("se retirer : le co-auteur une fois accepté ; l'auteur à tout état", () => {
    expect(canWithdraw("coauthor", "accepted")).toBe(true);
    expect(canWithdraw("coauthor", "pending")).toBe(true);
    expect(canWithdraw("coauthor", "declined")).toBe(false);
    for (const s of ["pending", "accepted", "declined", "withdrawn"] as const)
      expect(canWithdraw("author", s)).toBe(true);
  });

  it("supprimer : l'auteur d'origine seulement", () => {
    expect(canDeletePost("author")).toBe(true);
    expect(canDeletePost("coauthor")).toBe(false);
    expect(canDeletePost("other")).toBe(false);
  });

  it("signature et étiquette « Avec … »", () => {
    expect(signature({ name: "Kenji_66" }, { name: "Wrap 66" })).toBe("Kenji_66 et Wrap 66");
    const post = { author: { key: "u:k", name: "Kenji_66" }, coAuthor: { key: "p:w", name: "Wrap 66" } };
    expect(withLabel("u:k", post)).toBe("Avec Wrap 66");
    expect(withLabel("p:w", post)).toBe("Avec Kenji_66");
    expect(withLabel("u:autre", post)).toBeNull();
    expect(withLabel("u:k", { ...post, coAuthor: null })).toBeNull();
  });

  it("légende d'une demande : 120 caractères au plus", () => {
    expect(captionPreview(null)).toBe("");
    expect(captionPreview("  Covering   satiné \n terminé ")).toBe("Covering satiné terminé");
    const long = captionPreview("mot ".repeat(80));
    expect(long.length).toBeLessThanOrEqual(COAUTHOR_CAPTION_PREVIEW_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(captionPreview("x".repeat(300)).length).toBe(COAUTHOR_CAPTION_PREVIEW_MAX);
  });
});

describe("brouillon de « Publier »", () => {
  it("un envoi incertain garde son co-auteur dans le corps renvoyé, mais le brouillon affiché ne le reprend pas", () => {
    const body = { persona: "fan", caption: "x", coAuthor: { kind: "user", id: "abc" }, clientId: "c1" };
    const draft = draftFromBody(body, []);
    expect(draft.caption).toBe("x");
    expect(JSON.stringify(draft)).not.toContain("abc");
    // Le corps lui-même n'est pas touché : le même envoi (même clientId) repart avec son co-auteur.
    expect(body.coAuthor).toEqual({ kind: "user", id: "abc" });
  });
});

describe("ligne « Demandes » avec la seule invitation à publier", () => {
  it("le résumé donne 1 et la ligne est montrée ; l'ancien résumé sans le champ reste à 0", () => {
    const summary = {
      unreadMessages: 0,
      unseenActivity: 0,
      pendingRequests: 0,
      pendingCoauthors: 1,
      requests: { contact: 0 },
    };
    const counts = requestRowCounts(summary);
    expect(counts.activityRequests).toBe(1);
    expect(requestRowShown(counts.activityRequests, counts.status)).toBe(true);
    expect(requestRowCounts({ ...summary, pendingCoauthors: undefined }).activityRequests).toBe(0);
  });
});
