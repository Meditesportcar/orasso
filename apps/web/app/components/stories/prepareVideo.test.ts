import { storyVideoLabels as L, type Mp4Info, STORY_VIDEO_MAX_BYTES } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { clipIssue } from "./prepareVideo";

const info = (over: Partial<Mp4Info> = {}): Mp4Info => ({
  brand: "isom",
  durationMs: 12_000,
  width: 720,
  height: 1280,
  codec: "avc1",
  h264: true,
  hasAudio: true,
  ...over,
});

describe("vidéo choisie sur le site", () => {
  it("accepte une vidéo H.264 de 12 s", () => {
    expect(clipIssue(5_000_000, info())).toBeNull();
  });
  it("refuse, avec la phrase de l'API, une vidéo vide, lourde, longue, HEVC ou illisible", () => {
    expect(clipIssue(0, info())).toBe(L.empty);
    expect(clipIssue(STORY_VIDEO_MAX_BYTES + 1, info())).toBe(L.tooBig);
    expect(clipIssue(1000, info({ durationMs: 45_000 }))).toBe(L.tooLong);
    expect(clipIssue(1000, info({ codec: "hvc1", h264: false }))).toBe(L.codec);
    expect(clipIssue(1000, null)).toBe(L.unreadable);
  });
});
