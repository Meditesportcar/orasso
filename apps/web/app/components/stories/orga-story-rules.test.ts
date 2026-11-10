// Lot R7h, tour 4 : la section « Ma story » le lendemain de l'événement.
import { describe, expect, it } from "vitest";

import {
  mineFlags,
  noStoryMessage,
  reduceStoryMessage,
  showStorySection,
  visibleStoryMessage,
} from "./orga-story-rules";

const base = { published: true, fieldDay: false, hasMine: false, mineFailed: false, notice: null };

describe("section Ma story à J+1", () => {
  it("lecture réussie sans story : rien (absence confirmée)", () => {
    const f = mineFlags({ ok: true, data: { stories: [] } });
    expect(f).toEqual({ hasMine: false, mineFailed: false });
    expect(showStorySection({ ...base, ...f })).toBe(false);
  });

  it("réponse 503 : la section reste, en échec, avec l'erreur (jamais confondue avec « aucune story »)", () => {
    const f = mineFlags({ ok: false });
    expect(f).toEqual({ hasMine: false, mineFailed: true });
    expect(showStorySection({ ...base, ...f })).toBe(true);
  });

  it("une story en ligne : la section reste le lendemain", () => {
    const f = mineFlags({ ok: true, data: { stories: [{} as never] } });
    expect(showStorySection({ ...base, ...f })).toBe(true);
  });

  it("événement non publié : lecture non faite, rien", () => {
    expect(mineFlags(null)).toEqual({ hasMine: false, mineFailed: false });
    expect(showStorySection({ ...base, published: false, mineFailed: true })).toBe(false);
  });

  it("le message de confirmation reste visible après le retrait de la dernière story", () => {
    expect(showStorySection({ ...base, notice: "removed" })).toBe(true);
    expect(showStorySection({ ...base, notice: "added" })).toBe(false);
  });
});

describe("cycle de vie du message de confirmation (tour 6)", () => {
  const load = (s: ReturnType<typeof reduceStoryMessage>, eventId: string, notice: string | null) =>
    reduceStoryMessage(s, { eventId, notice });

  it("affiché une fois, gardé au chargement qui retire le paramètre, effacé à la revalidation suivante", () => {
    let s = load(noStoryMessage, "e1", "removed");
    expect(visibleStoryMessage(s, "e1")).toBe("removed");
    s = load(s, "e1", null); // la navigation qui retire ?story=
    expect(visibleStoryMessage(s, "e1")).toBe("removed");
    s = load(s, "e1", null); // première revalidation ensuite
    expect(visibleStoryMessage(s, "e1")).toBeNull();
  });

  it("après le dernier retrait, la section se referme une fois le message effacé", () => {
    const f = { published: true, fieldDay: false, hasMine: false, mineFailed: false };
    let s = load(noStoryMessage, "e1", "removed");
    expect(showStorySection({ ...f, notice: visibleStoryMessage(s, "e1") })).toBe(true);
    s = load(load(s, "e1", null), "e1", null);
    expect(showStorySection({ ...f, notice: visibleStoryMessage(s, "e1") })).toBe(false);
  });

  it("un changement d'événement l'efface et ne le montre jamais sur l'autre événement", () => {
    const s = load(noStoryMessage, "e1", "added");
    expect(visibleStoryMessage(s, "e2")).toBeNull();
    expect(load(s, "e2", null)).toEqual(noStoryMessage);
  });

  it("le même paramètre rechargé avant le retrait de l'adresse ne change rien", () => {
    const s = load(noStoryMessage, "e1", "added");
    expect(load(s, "e1", "added")).toBe(s);
  });
});
