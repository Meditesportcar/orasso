import { describe, expect, it } from "vitest";
import { storyPublishIssue, storyVideoBody } from "./storyPublish";
import {
  clock,
  STORY_VIDEO_LIMIT_MS,
  STORY_VIDEO_MAX_BYTES,
  storyExportKind,
  storyVideoIssue,
  storyVideoLayout,
  storyVideoNeedsCompression,
  videoProgress,
} from "./storyVideo";

describe("stories vidéo", () => {
  it("refuse une vidéo vide, trop lourde ou trop longue, accepte les limites", () => {
    expect(storyVideoIssue({ sizeBytes: 0, durationMs: 1000 })).toBe("empty");
    expect(storyVideoIssue({ sizeBytes: STORY_VIDEO_MAX_BYTES + 1, durationMs: 1000 })).toBe("too_big");
    expect(storyVideoIssue({ sizeBytes: 1000, durationMs: STORY_VIDEO_LIMIT_MS + 1 })).toBe("too_long");
    expect(storyVideoIssue({ sizeBytes: STORY_VIDEO_MAX_BYTES, durationMs: STORY_VIDEO_LIMIT_MS })).toBeNull();
    expect(storyVideoIssue({ sizeBytes: null, durationMs: null })).toBeNull();
  });

  it("pose une vidéo : 9:16 plein, sinon sur la vignette floutée", () => {
    expect(storyVideoLayout(720, 1280)).toBe("full");
    expect(storyVideoLayout(1080, 1920)).toBe("full");
    expect(storyVideoLayout(1080, 1950)).toBe("full");
    expect(storyVideoLayout(1920, 1080)).toBe("blurred");
    expect(storyVideoLayout(1080, 1080)).toBe("blurred");
    expect(storyVideoLayout(null, null)).toBe("full");
  });

  it("compresse une vidéo de la galerie si elle n'est pas en H.264, inconnue ou lourde", () => {
    expect(storyVideoNeedsCompression({ sizeBytes: 10_000_000, h264: true })).toBe(false);
    expect(storyVideoNeedsCompression({ sizeBytes: 10_000_000, h264: false })).toBe(true);
    expect(storyVideoNeedsCompression({ sizeBytes: 10_000_000, h264: null })).toBe(true);
    expect(storyVideoNeedsCompression({ sizeBytes: STORY_VIDEO_MAX_BYTES, h264: true })).toBe(true);
  });

  it("compteur et barre de lecture bornés", () => {
    expect(clock(7_400)).toBe("0:07");
    expect(clock(65_000)).toBe("1:05");
    expect(clock(-5)).toBe("0:00");
    expect(videoProgress(5, 10)).toBe(0.5);
    expect(videoProgress(12, 10)).toBe(1);
    expect(videoProgress(1, 0)).toBe(0);
    expect(videoProgress(Number.NaN, 10)).toBe(0);
  });

  it("export : photo rendue, vidéo telle quelle, crew refusé", () => {
    expect(storyExportKind({ mediaKind: "photo", audience: "public" })).toBe("render");
    expect(storyExportKind({ mediaKind: "video", audience: "followers" })).toBe("as_published");
    expect(storyExportKind({ mediaKind: "video", audience: "crew" })).toBe("refused");
  });

  it("le corps d'une vidéo n'a ni cadre ni décision de plaque, mais sa vignette", () => {
    const body = storyVideoBody({
      uploadKey: "k",
      posterKey: "p",
      audience: "followers",
      crewId: null,
      author: { persona: "fan" },
      caption: " ",
      place: "",
      vehicleId: null,
      eventId: null,
      tags: [],
    });
    expect(body).not.toHaveProperty("frame");
    expect(body).not.toHaveProperty("plateRects");
    expect(body).not.toHaveProperty("noPlateConfirmed");
    expect(body.posterKey).toBe("p");
    expect(body.caption).toBeNull();
  });

  it("une vidéo ne demande aucune plaque pour être publiée", () => {
    expect(storyPublishIssue({ hasPhoto: true, plate: null, caption: "" })).toBeNull();
    expect(storyPublishIssue({ hasPhoto: false, plate: null, caption: "" })).not.toBeNull();
  });
});
