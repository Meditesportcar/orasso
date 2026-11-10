// Lot R7h, tour 4 : la section « Ma story » le lendemain de l'événement.
import { describe, expect, it } from "vitest";

import { mineFlags, showStorySection } from "./orga-story-rules";

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
