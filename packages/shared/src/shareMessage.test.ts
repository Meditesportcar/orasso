import { describe, expect, it } from "vitest";

import type { ConversationSummary } from "./schemas/messaging";
import { addShareTargets, isShareTarget, noShareTargets, retryIds, shareTargetsEmpty } from "./shareMessage";

const conv = (id: string, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id,
  kind: "direct",
  side: "member",
  title: id,
  subtitle: null,
  avatarUrl: null,
  participants: [],
  lastMessage: null,
  unreadCount: 0,
  closedAt: null,
  storyThumbUrl: null,
  ...over,
});

describe("Partager > En message : liste des conversations", () => {
  it("seules les conversations à deux ou en crew, de mon côté et ouvertes", () => {
    expect(isShareTarget(conv("a"))).toBe(true);
    expect(isShareTarget(conv("a", { kind: "crew" }))).toBe(true);
    expect(isShareTarget(conv("a", { kind: "organizer" }))).toBe(false);
    expect(isShareTarget(conv("a", { kind: "story_reply" }))).toBe(false);
    expect(isShareTarget(conv("a", { side: "structure" }))).toBe(false);
    expect(isShareTarget(conv("a", { closedAt: "2026-11-01T10:00:00Z" }))).toBe(false);
  });

  it("une première page sans conversation admissible mais suivie d'une autre n'est pas « vide »", () => {
    // Trente conversations de structure, puis une conversation à deux sur la page suivante.
    const first = addShareTargets(noShareTargets, {
      items: Array.from({ length: 30 }, (_, i) => conv(`o${i}`, { kind: "organizer", side: "structure" })),
      nextCursor: "c2",
    });
    expect(first.items).toHaveLength(0);
    expect(shareTargetsEmpty(first)).toBe(false);
    const second = addShareTargets(first, {
      items: [conv("ami"), conv("o30", { kind: "organizer" })],
      nextCursor: null,
    });
    expect(second.items.map((c) => c.id)).toEqual(["ami"]);
    expect(second.next).toBeNull();
    expect(shareTargetsEmpty(second)).toBe(false);
  });

  it("vide pour de bon : lue en entier, sans page à venir ; non lue, ce n'est pas encore « vide »", () => {
    expect(shareTargetsEmpty(noShareTargets)).toBe(false);
    expect(shareTargetsEmpty(addShareTargets(noShareTargets, { items: [], nextCursor: null }))).toBe(true);
  });

  it("une page rejouée n'ajoute pas de doublon", () => {
    const page = { items: [conv("a"), conv("b")], nextCursor: "c" };
    const once = addShareTargets(noShareTargets, page);
    expect(addShareTargets(once, page).items).toHaveLength(2);
  });
});

describe("Partager > En message : envoi repris", () => {
  it("réponse perdue : la reprise garde le même identifiant ; après un envoi réussi, un nouveau", () => {
    let n = 0;
    const ids = retryIds(() => `id-${++n}`);
    const first = ids.get("conv-1");
    expect(ids.get("conv-1")).toBe(first); // la réponse s'est perdue, l'utilisateur retouche : même identifiant
    expect(ids.get("conv-2")).not.toBe(first);
    ids.done("conv-1");
    expect(ids.get("conv-1")).not.toBe(first);
  });
});
