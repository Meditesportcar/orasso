import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Mp4Error, readMp4Buffer, readMp4File } from "./mp4";

// Lecteur de conteneur du lot R7g. Fixtures : `story-2s.mp4` (2 s, 720 × 1280, H.264 + AAC, moov en tête) et
// `story-hevc.mp4` (1 s, HEVC), générées une fois par ffmpeg avec une mire : aucune plaque, aucune personne.
const fixture = (name: string) => readFile(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)));

/** Boîtes de premier niveau d'un fichier (pour le réordonner dans les tests). */
function topLevel(data: Buffer) {
  const boxes: { type: string; data: Buffer }[] = [];
  for (let o = 0; o + 8 <= data.length; ) {
    const size = data.readUInt32BE(o);
    boxes.push({ type: data.toString("latin1", o + 4, o + 8), data: data.subarray(o, o + size) });
    o += size;
  }
  return boxes;
}

const kind = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(Mp4Error);
  return (e as Mp4Error).kind;
};

describe("lecteur mp4", () => {
  it("lit la durée, les dimensions, le codec et le son d'une vidéo H.264", async () => {
    const info = await readMp4Buffer(await fixture("story-2s.mp4"));
    expect(info.durationMs).toBeGreaterThanOrEqual(1900);
    expect(info.durationMs).toBeLessThanOrEqual(2200);
    expect({ w: info.width, h: info.height }).toEqual({ w: 720, h: 1280 });
    expect(info.codec).toBe("avc1");
    expect(info.h264).toBe(true);
    expect(info.hasAudio).toBe(true);
  });

  it("reconnaît le HEVC (h264 faux, codec rendu)", async () => {
    const info = await readMp4Buffer(await fixture("story-hevc.mp4"));
    expect(info.h264).toBe(false);
    expect(info.codec).toMatch(/^(hvc1|hev1)$/);
    expect(info.hasAudio).toBe(false);
  });

  it("lit un fichier dont le moov est à la fin, et un fichier du disque sans le charger", async () => {
    const data = await fixture("story-2s.mp4");
    const boxes = topLevel(data);
    const moovLast = Buffer.concat([
      ...boxes.filter((b) => b.type !== "moov").map((b) => b.data),
      ...boxes.filter((b) => b.type === "moov").map((b) => b.data),
    ]);
    expect(topLevel(moovLast).at(-1)?.type).toBe("moov");
    const info = await readMp4Buffer(moovLast);
    expect(info.width).toBe(720);
    const dir = await mkdtemp(join(tmpdir(), "orasso-mp4-"));
    try {
      await writeFile(join(dir, "a.mp4"), moovLast);
      expect((await readMp4File(join(dir, "a.mp4"))).durationMs).toBe(info.durationMs);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applique la rotation de la piste (prise de vue verticale d'un téléphone)", async () => {
    const data = Buffer.from(await fixture("story-2s.mp4"));
    // Piste vidéo = première `tkhd` (version 0) : matrice 90° et dimensions stockées en paysage, comme un iPhone.
    const at = data.indexOf("tkhd");
    const v0 = at + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2;
    expect(data.readUInt8(at + 4)).toBe(0);
    data.writeInt32BE(0, v0);
    data.writeInt32BE(0x10000, v0 + 4);
    data.writeInt32BE(-0x10000, v0 + 12);
    data.writeInt32BE(0, v0 + 16);
    data.writeUInt32BE(1280 * 65536, v0 + 36);
    data.writeUInt32BE(720 * 65536, v0 + 40);
    const info = await readMp4Buffer(data);
    expect({ w: info.width, h: info.height }).toEqual({ w: 720, h: 1280 });
  });

  it("refuse un fichier sans piste vidéo", async () => {
    const data = Buffer.from(await fixture("story-2s.mp4"));
    data.write("soun", data.indexOf("vide"), "latin1");
    expect(await kind(readMp4Buffer(data))).toBe("no_video");
  });

  it("refuse un fichier illisible : tronqué, sans ftyp, hasard, texte, vide, marque inconnue", async () => {
    const data = await fixture("story-2s.mp4");
    expect(await kind(readMp4Buffer(data.subarray(0, Math.floor(data.length / 2))))).toBe("unreadable");
    expect(await kind(readMp4Buffer(data.subarray(0, 40)))).toBe("unreadable");
    expect(await kind(readMp4Buffer(data.subarray(8)))).toBe("unreadable");
    expect(await kind(readMp4Buffer(randomBytes(4096)))).toBe("unreadable");
    expect(await kind(readMp4Buffer(Buffer.from("Ceci n'est pas une vidéo du tout, pas du tout.")))).toBe("unreadable");
    expect(await kind(readMp4Buffer(Buffer.alloc(0)))).toBe("unreadable");
    const other = Buffer.from(data);
    other.write("zzzz", 8, "latin1");
    // Les marques compatibles restent lisibles ; on casse aussi celles-ci.
    for (let o = 16; o < other.readUInt32BE(0); o += 4) other.write("zzzz", o, "latin1");
    expect(await kind(readMp4Buffer(other))).toBe("unreadable");
  });

  it("refuse une boîte qui annonce plus que le fichier, ou un moov démesuré", async () => {
    const data = Buffer.from(await fixture("story-2s.mp4"));
    const boxes = topLevel(data);
    let o = 0;
    for (const b of boxes) {
      if (b.type === "moov") data.writeUInt32BE(0x7fffffff, o);
      o += b.data.length;
    }
    expect(await kind(readMp4Buffer(data))).toBe("unreadable");
  });

  it("s'arrête sur une suite de boîtes vides sans boucler", async () => {
    const ftyp = topLevel(await fixture("story-2s.mp4"))[0]?.data ?? Buffer.alloc(0);
    const empty = Buffer.alloc(8);
    empty.writeUInt32BE(8, 0);
    empty.write("free", 4, "latin1");
    const many = Buffer.concat([ftyp, ...Array.from({ length: 3000 }, () => empty)]);
    expect(await kind(readMp4Buffer(many))).toBe("unreadable");
  });
});
