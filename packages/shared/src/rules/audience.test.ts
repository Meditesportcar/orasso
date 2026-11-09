import { describe, expect, it } from "vitest";

import {
  type AudienceRelation,
  type AudienceStory,
  type AudienceViewer,
  canSeeStory,
  canTag,
  isStoryLive,
  isStoryPublishable,
  STORY_TTL_MS,
  storyBarOrder,
  storyDenial,
  storyExpiresAt,
  storyRing,
} from "./audience";

const me: AudienceViewer = { id: "me", active: true };
const base: AudienceStory = {
  authorId: "author",
  audience: "followers",
  crewId: null,
  authorVisibility: "public",
  authorActive: true,
};
const rel = (over: Partial<{ followAccepted: boolean; crews: string[] }> = {}): AudienceRelation => ({
  followAccepted: over.followAccepted ?? false,
  crewMemberActive: (id) => (over.crews ?? []).includes(id),
});

describe("canSeeStory", () => {
  it("ne sert jamais rien sans session ni à un compte indisponible", () => {
    for (const audience of ["public", "followers", "crew"] as const) {
      expect(canSeeStory(null, { ...base, audience, crewId: "c1" }, rel({ crews: ["c1"] }))).toBe(false);
      expect(canSeeStory({ id: "me", active: false }, { ...base, audience }, rel())).toBe(false);
    }
    expect(storyDenial(null, base, rel())).toBe("no_session");
  });

  it("public : tout membre connecté, sauf d'un compte privé où elle se lit comme « abonnés »", () => {
    expect(canSeeStory(me, { ...base, audience: "public" }, rel())).toBe(true);
    const priv = { ...base, audience: "public" as const, authorVisibility: "private" as const };
    expect(canSeeStory(me, priv, rel())).toBe(false);
    expect(storyDenial(me, priv, rel())).toBe("followers_only");
    expect(canSeeStory(me, priv, rel({ followAccepted: true }))).toBe(true);
    expect(canSeeStory({ id: "author", active: true }, priv, rel())).toBe(true);
  });

  it("abonnés d'un compte public : tout membre connecté", () => {
    expect(canSeeStory(me, base, rel())).toBe(true);
  });

  it("abonnés d'un compte privé : abonné accepté ou soi ; une demande en attente ne voit rien", () => {
    const priv = { ...base, authorVisibility: "private" as const };
    expect(canSeeStory(me, priv, rel({ followAccepted: true }))).toBe(true);
    expect(canSeeStory(me, priv, rel({ followAccepted: false }))).toBe(false);
    expect(storyDenial(me, priv, rel())).toBe("followers_only");
    expect(canSeeStory({ id: "author", active: true }, priv, rel())).toBe(true);
  });

  it("crew : membre actif seulement, crew_only sinon (suivre l'auteur ne suffit pas)", () => {
    const crew = { ...base, audience: "crew" as const, crewId: "c1" };
    expect(canSeeStory(me, crew, rel({ crews: ["c1"] }))).toBe(true);
    expect(canSeeStory(me, crew, rel({ crews: ["c2"], followAccepted: true }))).toBe(false);
    expect(storyDenial(me, crew, rel({ followAccepted: true }))).toBe("crew_only");
    expect(canSeeStory(me, { ...crew, crewId: null }, rel({ crews: ["c1"] }))).toBe(false);
  });

  it("un auteur suspendu, banni ou supprimé disparaît, même pour ses abonnés", () => {
    expect(canSeeStory(me, { ...base, authorActive: false }, rel({ followAccepted: true }))).toBe(false);
    expect(canSeeStory(me, { ...base, audience: "public", authorActive: false }, rel())).toBe(false);
  });
});

describe("storyRing et storyBarOrder", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const alive = { expiresAt: new Date("2026-11-11T08:00:00Z"), deletedAt: null };
  it("aucune story vivante : pas d'anneau", () => {
    expect(storyRing({ live: false }, [], now)).toBeNull();
    const expired = { audience: "public" as const, expiresAt: new Date("2026-11-10T11:00:00Z"), deletedAt: null };
    expect(storyRing({ live: false }, [expired], now)).toBeNull();
    expect(storyRing({ live: false }, [{ audience: "public", ...alive, deletedAt: now }], now)).toBeNull();
  });
  it("followers, crew (prioritaire), live", () => {
    expect(storyRing({ live: false }, [{ audience: "public", ...alive }], now)).toBe("followers");
    const mixed = [
      { audience: "followers" as const, ...alive },
      { audience: "crew" as const, ...alive },
    ];
    expect(storyRing({ live: false }, mixed, now)).toBe("crew");
    expect(storyRing({ live: true }, [{ audience: "followers", ...alive }], now)).toBe("live");
    expect(storyRing({ live: true }, [], now)).toBeNull();
  });
  it("non vues d'abord, puis la plus récente", () => {
    const e = (id: string, hasUnseen: boolean, iso: string) => ({ id, hasUnseen, latestAt: new Date(iso) });
    const input = [
      e("a", false, "2026-11-10T11:00:00Z"),
      e("b", true, "2026-11-10T08:00:00Z"),
      e("c", true, "2026-11-10T10:00:00Z"),
      e("d", false, "2026-11-10T11:30:00Z"),
    ];
    expect(storyBarOrder(input).map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("canTag", () => {
  const pub = { visibility: "public" as const };
  const priv = { visibility: "private" as const };
  it("une personne : seulement si elle peut voir la story", () => {
    expect(canTag(pub, { audience: "followers" }, { kind: "user", canSee: true, available: true })).toBeNull();
    expect(canTag(pub, { audience: "followers" }, { kind: "user", canSee: false, available: true })).toBe(
      "not_visible",
    );
    expect(canTag(pub, { audience: "crew" }, { kind: "user", canSee: true, available: true })).toBeNull();
    expect(canTag(pub, { audience: "crew" }, { kind: "user", canSee: true, available: false })).toBe("unavailable");
  });
  it("structure, pro, événement : refusés depuis un compte privé et sur une story de crew", () => {
    for (const kind of ["structure", "pro", "event"] as const) {
      expect(canTag(pub, { audience: "public" }, { kind, canSee: true, available: true })).toBeNull();
      expect(canTag(priv, { audience: "followers" }, { kind, canSee: true, available: true })).toBe("private_account");
      expect(canTag(pub, { audience: "crew" }, { kind, canSee: true, available: true })).toBe("crew_story");
    }
  });
});

describe("isStoryPublishable", () => {
  it("photo : décision de plaque obligatoire ; vidéo : sans décision", () => {
    expect(isStoryPublishable({ mediaKind: "photo", plateState: null })).toBe(false);
    expect(isStoryPublishable({ mediaKind: "photo", plateState: "not_required" })).toBe(false);
    expect(isStoryPublishable({ mediaKind: "photo", plateState: "blurred" })).toBe(true);
    expect(isStoryPublishable({ mediaKind: "photo", plateState: "none_confirmed" })).toBe(true);
    expect(isStoryPublishable({ mediaKind: "video", plateState: null })).toBe(true);
    expect(isStoryPublishable({ mediaKind: "video", plateState: "not_required" })).toBe(true);
  });
});

describe("durée de vie", () => {
  it("24 h, vivante tant que prête, non supprimée, non expirée", () => {
    const at = new Date("2026-11-10T10:00:00Z");
    expect(storyExpiresAt(at).getTime() - at.getTime()).toBe(STORY_TTL_MS);
    const s = { status: "ready" as const, expiresAt: storyExpiresAt(at), deletedAt: null };
    expect(isStoryLive(s, at)).toBe(true);
    expect(isStoryLive(s, s.expiresAt)).toBe(false);
    expect(isStoryLive({ ...s, status: "processing" }, at)).toBe(false);
    expect(isStoryLive({ ...s, deletedAt: at }, at)).toBe(false);
  });
});
