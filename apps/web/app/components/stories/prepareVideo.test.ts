import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { storyVideoLabels as L, type Mp4Info, STORY_VIDEO_MAX_BYTES } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { clipIssue, probeClip } from "./prepareVideo";

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

describe("vidéo valide de 40 s avec du son, choisie sur le site (tour 5)", () => {
  /** La mire de 2 s de l'API (H.264 + AAC), dont les deux pistes disent 40 s dans `mdhd` et dans `stts`. */
  function fortySeconds(): Buffer {
    const data = Buffer.from(
      readFileSync(fileURLToPath(new URL("../../../../api/test/fixtures/story-2s.mp4", import.meta.url))),
    );
    const mvhd = data.indexOf("mvhd") + 4;
    data.writeUInt32BE(data.readUInt32BE(mvhd + 12) * 40, mvhd + 16);
    const firstStts = data.indexOf("stts");
    const firstMdhd = data.indexOf("mdhd");
    for (const [stts, mdhd] of [
      [firstStts, firstMdhd],
      [data.indexOf("stts", firstStts + 1), data.indexOf("mdhd", firstMdhd + 1)],
    ] as const) {
      data.writeUInt32BE(data.readUInt32BE(mdhd + 16) * 40, mdhd + 20);
      for (let i = 0; i < data.readUInt32BE(stts + 8); i++) {
        const delta = stts + 12 + i * 8 + 4;
        data.writeUInt32BE(data.readUInt32BE(delta) * 20, delta);
      }
    }
    return data;
  }

  it("est lue (durée et son), puis refusée avec la phrase « trop longue », jamais « ne se lit pas »", async () => {
    const file = new File([new Uint8Array(fortySeconds())], "longue.mp4", { type: "video/mp4" });
    const probed = await probeClip(file);
    expect(probed).not.toBeNull();
    expect(probed?.hasAudio).toBe(true);
    expect(probed?.durationMs).toBeGreaterThan(39_000);
    expect(clipIssue(file.size, probed)).toBe(L.tooLong);
    expect(clipIssue(file.size, probed)).not.toBe(L.unreadable);
  });
});
