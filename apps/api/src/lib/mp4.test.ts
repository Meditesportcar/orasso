import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appendChild,
  bareTrack,
  box,
  chunksTrack,
  FAKE_PLACE,
  mebxKeys,
  metaEntry,
  pcmTrack,
  sampledTrack,
  shrinkBox,
  withEntryChild,
  withLocation,
  withMdatGap,
  withMdatTrack,
} from "../../test/mp4-builders";
import { Mp4Error, readMp4Buffer, readMp4File, stripMp4Metadata } from "./mp4";

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

// ─── Tour 2 : fichiers abîmés, durée réelle, conteneurs sans image, métadonnées effacées ───────────────────────────────

const TRUNCATIONS: [string, string[]][] = [
  ["mvhd", ["moov", "mvhd"]],
  ["tkhd", ["moov", "trak", "tkhd"]],
  ["mdhd", ["moov", "trak", "mdia", "mdhd"]],
  ["hdlr", ["moov", "trak", "mdia", "hdlr"]],
  ["stsd", ["moov", "trak", "mdia", "minf", "stbl", "stsd"]],
  ["stsz", ["moov", "trak", "mdia", "minf", "stbl", "stsz"]],
  ["stco", ["moov", "trak", "mdia", "minf", "stbl", "stco"]],
];

describe("lecteur mp4 : fichiers corrompus", () => {
  it("une boîte vide ou tronquée (mvhd, tkhd, mdhd, hdlr, stsd, stsz, stco) est un fichier illisible, jamais une erreur interne", async () => {
    const data = await fixture("story-2s.mp4");
    for (const [name, path] of TRUNCATIONS) {
      for (const length of [0, 1, 4, 5, 9, 13, 16]) {
        if (name === "hdlr" && length >= 12) continue; // le type de gestionnaire (12 octets) suffit au lecteur
        expect(await kind(readMp4Buffer(shrinkBox(data, path, length))), `${name} à ${length} octets`).toBe(
          "unreadable",
        );
      }
    }
  });

  it("un mehd vide ou tronqué dans mvex est un fichier illisible", async () => {
    const data = await fixture("story-2s.mp4");
    for (const length of [0, 1, 4, 7]) {
      const broken = appendChild(data, ["moov"], box("mvex", box("mehd", Buffer.alloc(length))));
      expect(await kind(readMp4Buffer(broken)), `mehd à ${length} octets`).toBe("unreadable");
    }
  });

  it("des octets abîmés au hasard dans moov donnent un résultat ou un refus lisible, jamais une autre erreur", async () => {
    const data = await fixture("story-2s.mp4");
    const moovAt = data.indexOf("moov") - 4;
    const moovEnd = moovAt + data.readUInt32BE(moovAt);
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let i = 0; i < 300; i++) {
      const copy = Buffer.from(data);
      for (let k = 0; k < 1 + (i % 4); k++) copy[moovAt + 8 + (next() % (moovEnd - moovAt - 8))] = next() % 256;
      const outcome = await readMp4Buffer(copy).then(
        () => "ok",
        (error: unknown) => error,
      );
      if (outcome !== "ok") expect(outcome).toBeInstanceOf(Mp4Error);
    }
  });
});

describe("lecteur mp4 : durée réelle", () => {
  /** Durée écrite (en secondes) dans une boîte `mvhd` ou `mdhd` de version 0, à partir de `from`. */
  function setSeconds(data: Buffer, type: "mvhd" | "mdhd", seconds: number, from = 0) {
    const at = data.indexOf(type, from) + 4;
    const timescale = data.readUInt32BE(at + 4 + 8);
    data.writeUInt32BE(Math.round(timescale * seconds), at + 4 + 12);
    return at;
  }

  /** Fait dire à `stts` (première entrée de la piste vidéo) que la piste dure `seconds` secondes. */
  function setVideoSamples(data: Buffer, seconds: number) {
    const stts = data.indexOf("stts");
    const timescale = data.readUInt32BE(data.indexOf("mdhd") + 16);
    const count = data.readUInt32BE(stts + 12);
    data.writeUInt32BE(Math.round((seconds * timescale) / count), stts + 16);
  }

  it("retient la plus longue durée de mvhd et de chaque piste : 10 s annoncées, 40 s dans la piste vidéo, 35 s dans le son", async () => {
    const base = await fixture("story-2s.mp4");
    const video = Buffer.from(base);
    setSeconds(video, "mvhd", 10);
    setSeconds(video, "mdhd", 40);
    setVideoSamples(video, 40); // tour 3 : la somme de `stts` doit dire la même chose que `mdhd`
    expect((await readMp4Buffer(video)).durationMs).toBeGreaterThanOrEqual(39_900);

    const audio = Buffer.from(base);
    setSeconds(audio, "mvhd", 10);
    const secondTrack = setSeconds(audio, "mdhd", 1);
    setSeconds(audio, "mdhd", 35, secondTrack + 8);
    expect((await readMp4Buffer(audio)).durationMs).toBeGreaterThanOrEqual(34_900);

    // Rien d'anormal : le plus long reste celui du fichier d'origine (environ 2 s).
    expect((await readMp4Buffer(base)).durationMs).toBeLessThan(2200);
  });
});

describe("lecteur mp4 : conteneur sans image", () => {
  const badStsz = (data: Buffer) => {
    const out = Buffer.from(data);
    const at = out.indexOf("stsz");
    out.writeUInt32BE(0, at + 4 + 4);
    out.writeUInt32BE(0, at + 4 + 8);
    return out;
  };

  it("refuse un fichier sans échantillon (stsz vide), sans configuration AVC, ou dont les morceaux sortent du fichier", async () => {
    const data = await fixture("story-2s.mp4");
    expect(await kind(readMp4Buffer(badStsz(data)))).toBe("unreadable");

    const noAvcC = Buffer.from(data);
    noAvcC.write("avcX", noAvcC.indexOf("avcC"), "latin1");
    expect(await kind(readMp4Buffer(noAvcC))).toBe("unreadable");

    const outside = Buffer.from(data);
    const stco = outside.indexOf("stco");
    outside.writeUInt32BE(data.length + 1000, stco + 4 + 4 + 4);
    expect(await kind(readMp4Buffer(outside))).toBe("unreadable");

    // Un morceau qui tombe dans le fichier mais hors de `mdat` (dans les en-têtes).
    const inHeader = Buffer.from(data);
    inHeader.writeUInt32BE(100, inHeader.indexOf("stco") + 4 + 4 + 4);
    expect(await kind(readMp4Buffer(inHeader))).toBe("unreadable");

    const noChunks = Buffer.from(data);
    noChunks.writeUInt32BE(0, noChunks.indexOf("stco") + 4 + 4);
    expect(await kind(readMp4Buffer(noChunks))).toBe("unreadable");
  });

  it("refuse le conteneur « vide » : mdat sans octet, entrée avc1 sans configuration, aucun échantillon", async () => {
    const data = await fixture("story-2s.mp4");
    const boxes = topLevel(data);
    const hollow = Buffer.concat(boxes.map((b) => (b.type === "mdat" ? box("mdat") : b.data)));
    expect(await kind(readMp4Buffer(hollow))).toBe("unreadable");
    // Le cas relevé par la relecture : mdat vide, entrée simplement nommée avc1, rien dans les tables.
    const bare = badStsz(hollow);
    bare.write("avcX", bare.indexOf("avcC"), "latin1");
    expect(await kind(readMp4Buffer(bare))).toBe("unreadable");
  });

  it("garde la fixture HEVC lisible (h264 faux) : la configuration AVC n'est exigée que pour le H.264", async () => {
    expect((await readMp4Buffer(await fixture("story-hevc.mp4"))).h264).toBe(false);
  });
});

describe("effacement des métadonnées (stripMp4Metadata)", () => {
  /** Un petit fichier à la main : `udta`, `meta` et `uuid` au premier niveau, sous moov et dans une piste. */
  function synthetic() {
    const place = Buffer.from(`©xyz ${FAKE_PLACE}`, "latin1");
    const payload = Buffer.from("garde-moi");
    const trak = box("trak", box("tkhd", payload), box("udta", place), box("meta", place), box("uuid", place));
    const moov = box("moov", box("mvhd", payload), box("udta", place), box("meta", place), box("uuid", place), trak);
    return Buffer.concat([
      box("ftyp", Buffer.from("isom"), Buffer.alloc(4), Buffer.from("isom")),
      box("udta", place),
      box("mdat", payload),
      moov,
      box("uuid", Buffer.alloc(16, 1), place),
      box("meta", Buffer.alloc(4), place),
    ]);
  }

  it("change en free le type de chaque udta, meta et uuid (premier niveau, moov, trak) et les vide ; le reste est intact", async () => {
    const data = synthetic();
    const dir = await mkdtemp(join(tmpdir(), "orasso-strip-"));
    try {
      const path = join(dir, "a.mp4");
      await writeFile(path, data);
      expect(await stripMp4Metadata(path)).toBe(9);
      const out = await readFile(path);
      expect(out.length).toBe(data.length);
      for (const trace of ["udta", "meta", "uuid", "xyz", "42.6887"]) {
        expect(out.includes(trace), trace).toBe(false);
      }
      // Les boîtes qui ne portent pas de métadonnées sont intactes (mvhd, tkhd, mdat, ftyp).
      expect(out.includes("mvhd")).toBe(true);
      expect(out.includes("tkhd")).toBe(true);
      expect(out.includes("mdat")).toBe(true);
      // Le contenu de mvhd et tkhd est intact ; celui de mdat, que nulle piste ne référence, est mis à zéro (tour 6).
      expect(out.includes("garde-moi")).toBe(true);
      const mdatAt = out.indexOf("mdat") + 4;
      expect(out.subarray(mdatAt, mdatAt + "garde-moi".length).every((b) => b === 0)).toBe(true);
      // Une seconde passe ne change plus un octet.
      await stripMp4Metadata(path);
      expect((await readFile(path)).equals(out)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("garde la fixture lisible avec les mêmes décalages", async () => {
    const data = withLocation(await fixture("story-2s.mp4"));
    const dir = await mkdtemp(join(tmpdir(), "orasso-strip-"));
    try {
      const path = join(dir, "a.mp4");
      await writeFile(path, data);
      expect(await stripMp4Metadata(path)).toBeGreaterThanOrEqual(3);
      const out = await readFile(path);
      expect(out.length).toBe(data.length);
      expect(out.includes(FAKE_PLACE)).toBe(false);
      expect((await readMp4File(path)).h264).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── Tour 3 : fragmentés, durée par échantillons, pistes de position, configuration AVC ───────────────────────────────

describe("lecteur mp4 : fichiers fragmentés (refusés)", () => {
  it("refuse mvex et moof, et la fixture fragmentée sans mdat (zéro image) n'est plus acceptée", async () => {
    const data = await fixture("story-2s.mp4");
    expect(await kind(readMp4Buffer(appendChild(data, ["moov"], box("mvex", box("trex", Buffer.alloc(24))))))).toBe(
      "unreadable",
    );
    expect(await kind(readMp4Buffer(Buffer.concat([data, box("moof", box("mfhd", Buffer.alloc(8)))])))).toBe(
      "unreadable",
    );
    // Le cas relevé par la relecture : plus de mdat, un mvex, un moof vide, zéro échantillon vidéo.
    const boxes = topLevel(data);
    const moov = appendChild(
      boxes.find((x) => x.type === "moov")?.data ?? Buffer.alloc(0),
      ["moov"],
      box("mvex", box("trex", Buffer.alloc(24))),
    );
    const fragmented = Buffer.concat([
      boxes[0]?.data ?? Buffer.alloc(0),
      moov,
      box("moof", box("mfhd", Buffer.alloc(8))),
    ]);
    expect(await kind(readMp4Buffer(fragmented))).toBe("unreadable");
  });
});

describe("lecteur mp4 : durée de la piste vidéo par les échantillons (stts)", () => {
  it("refuse un stts qui ne dit pas la même chose que mdhd, accepte celui qui concorde", async () => {
    const base = Buffer.from(await fixture("story-2s.mp4"));
    const stts = base.indexOf("stts");
    // 300 s d'échantillons derrière un mdhd de 2 s.
    const hidden = Buffer.from(base);
    hidden.writeUInt32BE(hidden.readUInt32BE(stts + 16) * 150, stts + 16);
    expect(await kind(readMp4Buffer(hidden))).toBe("unreadable");
    // mdhd à 40 s, échantillons à 2 s.
    const short = Buffer.from(base);
    const mdhd = short.indexOf("mdhd");
    short.writeUInt32BE(40 * short.readUInt32BE(mdhd + 16), mdhd + 20);
    expect(await kind(readMp4Buffer(short))).toBe("unreadable");
    // Une table dont les entrées sortent de la boîte.
    const wide = Buffer.from(base);
    wide.writeUInt32BE(1_000_000, stts + 8);
    expect(await kind(readMp4Buffer(wide))).toBe("unreadable");
    expect((await readMp4Buffer(base)).durationMs).toBeLessThan(2200);
  });
});

describe("lecteur mp4 : champs temporels exigés, durée de la piste son", () => {
  it("refuse une vidéo sans stts, sans mdhd, ou à échelle de temps nulle, ou dont stts ne compte pas les échantillons de stsz", async () => {
    const base = Buffer.from(await fixture("story-2s.mp4"));
    // Les boîtes retirées sont renommées `free` (même taille : les décalages ne bougent pas).
    const renamed = (type: string, nth = 0) => {
      const out = Buffer.from(base);
      let at = -1;
      for (let i = 0; i <= nth; i++) at = out.indexOf(type, at + 1);
      out.write("free", at, "latin1");
      return out;
    };
    expect(await kind(readMp4Buffer(renamed("stts")))).toBe("unreadable");
    expect(await kind(readMp4Buffer(renamed("mdhd")))).toBe("unreadable");
    const zero = Buffer.from(base);
    zero.writeUInt32BE(0, zero.indexOf("mdhd") + 16);
    expect(await kind(readMp4Buffer(zero))).toBe("unreadable");
    const count = Buffer.from(base);
    const stts = count.indexOf("stts");
    count.writeUInt32BE(count.readUInt32BE(stts + 12) + 1, stts + 12);
    expect(await kind(readMp4Buffer(count))).toBe("unreadable");
    expect((await readMp4Buffer(base)).h264).toBe(true);
  });

  it("retient la durée du son d'après ses échantillons (80 s cachées derrière un mdhd de 2 s) : le fichier est lu, l'appelant refuse « trop longue »", async () => {
    const base = Buffer.from(await fixture("story-2s.mp4"));
    const firstStts = base.indexOf("stts");
    const audioStts = base.indexOf("stts", firstStts + 1);
    expect(audioStts).toBeGreaterThan(firstStts);
    const hidden = Buffer.from(base);
    hidden.writeUInt32BE(hidden.readUInt32BE(audioStts + 16) * 40, audioStts + 16);
    const info = await readMp4Buffer(hidden);
    expect(info.durationMs).toBeGreaterThan(70_000);
    expect(info.hasAudio).toBe(true);
    expect((await readMp4Buffer(base)).hasAudio).toBe(true);
  });
});

describe("lecteur mp4 : pistes de position", () => {
  // moov placé à la fin : ajouter une piste ne décale pas les données (les décalages de `stco` sont absolus).
  const withTrack = async (track: Buffer) => {
    const boxes = topLevel(await fixture("story-2s.mp4"));
    const moovLast = Buffer.concat(
      [...boxes.filter((b) => b.type !== "moov"), ...boxes.filter((b) => b.type === "moov")].map((b) => b.data),
    );
    return appendChild(moovLast, ["moov"], track);
  };

  it("refuse une piste dont le gestionnaire n'est ni vide, ni soun, ni tmcd (gpmd, texte, caméra…)", async () => {
    for (const handler of ["gpmd", "text", "camm", "sbtl", "zzzz"]) {
      expect(await kind(readMp4Buffer(await withTrack(bareTrack(handler)))), handler).toBe("location_track");
    }
    // Sans tkhd ni quoi que ce soit d'autre : le gestionnaire est lu en premier.
    expect(await kind(readMp4Buffer(await withTrack(box("trak", box("mdia", box("hdlr", Buffer.alloc(8)))))))).toBe(
      "unreadable",
    );
    expect(await kind(readMp4Buffer(await withTrack(box("trak", box("mdia", box("mdhd", Buffer.alloc(24)))))))).toBe(
      "location_track",
    );
  });

  it("refuse la télémétrie réelle (gestionnaire meta, entrée gpmd, djmd, camm ou inconnue), accepte mett et mebx", async () => {
    for (const format of ["gpmd", "djmd", "camm", "zzzz"]) {
      expect(await kind(readMp4Buffer(await withTrack(bareTrack("meta", metaEntry(format))))), format).toBe(
        "location_track",
      );
    }
    // Une piste de métadonnées sans description du tout n'est pas une piste connue.
    expect(await kind(readMp4Buffer(await withTrack(bareTrack("meta"))))).toBe("location_track");
    // Photo animée (`mett`) : acceptée.
    expect((await readMp4Buffer(await withTrack(bareTrack("meta", metaEntry("mett"))))).h264).toBe(true);
  });

  it("accepte le code temporel (tmcd)", async () => {
    expect((await readMp4Buffer(await withTrack(bareTrack("tmcd")))).h264).toBe(true);
  });

  it("refuse une piste meta ou mebx dont les clés parlent d'un lieu, accepte celle qui n'en dit rien", async () => {
    const place = mebxKeys("com.apple.quicktime.location.ISO6709");
    expect(await kind(readMp4Buffer(await withTrack(bareTrack("mebx", place))))).toBe("location_track");
    expect(
      await kind(readMp4Buffer(await withTrack(bareTrack("meta", mebxKeys("Com.Apple.Quicktime.LOCATION.Name"))))),
    ).toBe("location_track");
    expect(await kind(readMp4Buffer(await withTrack(bareTrack("mebx", mebxKeys("a.b.iso6709")))))).toBe(
      "location_track",
    );
    const calm = mebxKeys("com.apple.quicktime.still-image-time", "com.apple.quicktime.detected-face");
    expect((await readMp4Buffer(await withTrack(bareTrack("mebx", calm)))).h264).toBe(true);
    expect((await readMp4Buffer(await withTrack(bareTrack("meta", calm)))).h264).toBe(true);
  });
});

describe("lecteur mp4 : configuration AVC", () => {
  /** Octets de `avcC` : version, profil, compatibilité, niveau, longueurs, nb de SPS, [longueur, SPS], nb de PPS, [longueur, PPS]. */
  async function config() {
    const data = Buffer.from(await fixture("story-2s.mp4"));
    const at = data.indexOf("avcC") + 4;
    const spsLength = data.readUInt16BE(at + 6);
    const ppsCount = at + 8 + spsLength;
    return {
      data,
      at,
      spsLength,
      spsAt: at + 8,
      ppsCount,
      ppsLength: data.readUInt16BE(ppsCount + 1),
      ppsAt: ppsCount + 3,
    };
  }

  it("accepte la configuration de la fixture, refuse une configuration vide, sans SPS ou sans PPS", async () => {
    const c = await config();
    expect((await readMp4Buffer(c.data)).h264).toBe(true);

    // Le cas relevé : tout à zéro, sauf la version et un SPS déclaré.
    const zeros = Buffer.from(c.data);
    zeros.fill(0, c.at + 1, c.at + 46);
    zeros[c.at + 5] = 0xe1;
    expect(await kind(readMp4Buffer(zeros))).toBe("unreadable");

    const noSps = Buffer.from(c.data);
    noSps[c.at + 5] = 0xe0;
    expect(await kind(readMp4Buffer(noSps))).toBe("unreadable");

    const noPps = Buffer.from(c.data);
    noPps[c.ppsCount] = 0;
    expect(await kind(readMp4Buffer(noPps))).toBe("unreadable");
  });

  it("refuse des longueurs hors bornes, vides, un mauvais type de NAL, une mauvaise version ou des longueurs de NAL invalides", async () => {
    const c = await config();
    const patched = (change: (b: Buffer) => void) => {
      const b = Buffer.from(c.data);
      change(b);
      return b;
    };
    const cases: [string, Buffer][] = [
      ["SPS plus long que la boîte", patched((b) => b.writeUInt16BE(0xffff, c.at + 6))],
      ["SPS vide", patched((b) => b.writeUInt16BE(0, c.at + 6))],
      ["PPS plus long que la boîte", patched((b) => b.writeUInt16BE(0xffff, c.ppsCount + 1))],
      ["PPS vide", patched((b) => b.writeUInt16BE(0, c.ppsCount + 1))],
      ["NAL du SPS d'un autre type", patched((b) => (b[c.spsAt] = 0x68))],
      ["NAL du PPS d'un autre type", patched((b) => (b[c.ppsAt] = 0x67))],
      ["version 2", patched((b) => (b[c.at] = 2))],
      ["longueurs de NAL sur 3 octets", patched((b) => (b[c.at + 4] = 0xfe))],
      ["deux SPS annoncés, un seul présent", patched((b) => (b[c.at + 5] = 0xe2))],
    ];
    for (const [name, data] of cases) expect(await kind(readMp4Buffer(data)), name).toBe("unreadable");
  });

  it("refuse une boîte avcC tronquée à chaque longueur", async () => {
    const c = await config();
    // Jusqu'à la fin du PPS : au-delà, ce sont les octets facultatifs du profil High (chroma, profondeur), qui ne manquent à personne.
    const end = c.ppsAt + c.ppsLength - c.at;
    for (let payload = 0; payload < end; payload++) {
      const b = Buffer.from(c.data);
      b.writeUInt32BE(8 + payload, c.at - 8);
      expect(await kind(readMp4Buffer(b)), `avcC à ${payload} octets`).toBe("unreadable");
    }
  });
});

// ─── Tour 5 : nettoyage par liste blanche, durée de toutes les pistes gardées, vidéo trop longue ──────────────────────

/** Les échantillons d'une piste « métadonnées » ou « code temporel » : des coordonnées factices, dans `mdat`. */
const gpxPayload = Buffer.from(
  `<gpx><trkpt lat="42.6887" lon="2.8948"/><name>${FAKE_PLACE}</name></gpx>`.padEnd(200, " "),
  "latin1",
);

const failure = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (error: unknown) => error,
  );

describe("effacement par liste blanche (stripMp4Metadata, tour 5)", () => {
  const workDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
    const dir = await mkdtemp(join(tmpdir(), "orasso-strip-"));
    try {
      return await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  /** Les images et le son de la fixture (`mdat` sans la queue ajoutée par `withMdatTrack`), à retrouver intacts. */
  const mediaBytes = (data: Buffer) => {
    const at = data.indexOf("mdat") - 4;
    return data.subarray(at + 8, at + data.readUInt32BE(at) - gpxPayload.length);
  };

  it("une piste meta/mett au MIME GPX garde ses coordonnées dans mdat : elles sont mises à zéro, la vidéo reste lisible et dure autant", async () => {
    const original = await fixture("story-2s.mp4");
    for (const [handler, format] of [
      ["meta", "mett"],
      ["meta", "mebx"],
      ["tmcd", "tmcd"],
    ] as const) {
      const { file } = withMdatTrack(
        original,
        (at) => sampledTrack(handler, format, at, gpxPayload.length),
        gpxPayload,
      );
      expect(file.includes(FAKE_PLACE), handler).toBe(true);
      const before = await readMp4Buffer(file);
      await workDir(async (dir) => {
        const path = join(dir, "a.mp4");
        await writeFile(path, file);
        await stripMp4Metadata(path);
        const out = await readFile(path);
        expect(out.length).toBe(file.length);
        for (const trace of [FAKE_PLACE, "42.6887", "2.8948", "gpx", "Orasso"]) {
          expect(out.includes(trace), `${handler} ${trace}`).toBe(false);
        }
        const after = await readMp4File(path);
        expect(after.durationMs).toBe(before.durationMs);
        expect(after.h264).toBe(true);
        expect(after.hasAudio).toBe(true);
        expect(after.width).toBe(before.width);
      });
    }
  });

  it("les images et le son restent octet pour octet, les échantillons effacés sont des zéros à la même place", async () => {
    const original = await fixture("story-2s.mp4");
    const { file } = withMdatTrack(original, (at) => sampledTrack("meta", "mett", at, gpxPayload.length), gpxPayload);
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      await stripMp4Metadata(path);
      const out = await readFile(path);
      expect(mediaBytes(out).equals(mediaBytes(file))).toBe(true);
      expect(mediaBytes(out).length).toBeGreaterThan(100_000);
      const at = file.indexOf(gpxPayload);
      expect(out.subarray(at, at + gpxPayload.length).every((b) => b === 0)).toBe(true);
    });
  });

  it("une boîte gps  de moov, un bloc free de premier niveau marqué GPS (façon Novatek) et une boîte inconnue sont mis à zéro", async () => {
    const original = await fixture("story-2s.mp4");
    const gps = box("gps ", Buffer.from(`GPS0 ${FAKE_PLACE} $GPRMC,123519,A,4253.3,N,00253.7,E`));
    const novatek = box("free", Buffer.from(`GPS ${FAKE_PLACE}`.padEnd(120, "\0"), "latin1"));
    const strange = box("zzzz", Buffer.from(`inconnue ${FAKE_PLACE}`));
    // `moov` grossit de `gps ` et `zzzz` : les `stco` des pistes suivent, comme pour une piste de plus.
    const delta = gps.length + strange.length;
    const shifted = Buffer.from(original);
    for (let from = shifted.indexOf("stco"); from >= 0; from = shifted.indexOf("stco", from + 1)) {
      for (let i = 0; i < shifted.readUInt32BE(from + 8); i++) {
        const o = from + 12 + i * 4;
        shifted.writeUInt32BE(shifted.readUInt32BE(o) + delta, o);
      }
    }
    const grown = appendChild(appendChild(shifted, ["moov"], gps), ["moov"], strange);
    const file = Buffer.concat([grown, novatek]);
    expect(file.includes("GPS0")).toBe(true);
    const before = await readMp4Buffer(file);
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      expect(await stripMp4Metadata(path)).toBeGreaterThanOrEqual(3);
      const out = await readFile(path);
      expect(out.length).toBe(file.length);
      for (const trace of ["GPS0", "GPS ", FAKE_PLACE, "GPRMC", "inconnue", "gps ", "zzzz"]) {
        expect(out.includes(trace), trace).toBe(false);
      }
      expect((await readMp4File(path)).durationMs).toBe(before.durationMs);
    });
  });

  it("les octets après la dernière boîte sont coupés, par le vrai parcours : le lecteur accepte le fichier, puis le nettoyage", async () => {
    const original = await fixture("story-2s.mp4");
    // Le lecteur ne tolère derrière la dernière boîte que moins de 8 octets ; au-delà, c'est lui qui refuse (le fichier n'est
    // alors jamais gardé, le nettoyage n'a rien à faire).
    const trailer = Buffer.from(`\0GPS${FAKE_PLACE.slice(0, 2)}`, "latin1");
    expect(trailer.length).toBeLessThan(8);
    const file = Buffer.concat([original, trailer]);
    const big = Buffer.concat([original, Buffer.from(`INSV-TRAILER ${FAKE_PLACE}`), Buffer.alloc(300, 0xff)]);
    expect(await kind(readMp4Buffer(big))).toBe("unreadable");
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      const info = await readMp4File(path); // 1. le lecteur accepte
      expect(info.h264).toBe(true);
      await stripMp4Metadata(path); // 2. le nettoyage coupe
      const out = await readFile(path);
      const alone = join(dir, "alone.mp4");
      await writeFile(alone, original);
      await stripMp4Metadata(alone);
      expect(out.equals(await readFile(alone))).toBe(true);
      expect(out.length).toBe(file.length - trailer.length);
      expect(out.includes("GPS")).toBe(false);
      expect((await readMp4File(path)).durationMs).toBe(info.durationMs);
    });
  });

  it("refuse (Mp4Error) un morceau qui pointe dans la partie coupée, ou des échantillons effacés qui sortent de mdat", async () => {
    const original = await fixture("story-2s.mp4");
    await workDir(async (dir) => {
      // Un morceau de la piste meta au-delà de la dernière boîte (dans un bloc de fin).
      const { file } = withMdatTrack(original, (at) => sampledTrack("meta", "mett", at, gpxPayload.length), gpxPayload);
      const beyond = Buffer.concat([file, Buffer.alloc(64, 0xff)]);
      beyond.writeUInt32BE(file.length + 8, beyond.lastIndexOf("stco") + 12);
      const p1 = join(dir, "beyond.mp4");
      await writeFile(p1, beyond);
      expect(await failure(stripMp4Metadata(p1))).toBeInstanceOf(Mp4Error);
      // Un morceau du son dans la partie coupée.
      const audio = Buffer.concat([original, Buffer.alloc(64, 0xff)]);
      audio.writeUInt32BE(original.length + 8, audio.indexOf("stco", audio.indexOf("stco") + 1) + 12);
      const p2 = join(dir, "audio.mp4");
      await writeFile(p2, audio);
      expect(await failure(stripMp4Metadata(p2))).toBeInstanceOf(Mp4Error);
      // Des échantillons de métadonnées qui commencent dans moov, hors de mdat : jamais effacés au hasard.
      const inside = withMdatTrack(
        original,
        () => sampledTrack("meta", "mett", 40, gpxPayload.length),
        gpxPayload,
      ).file;
      const p3 = join(dir, "inside.mp4");
      await writeFile(p3, inside);
      expect(await failure(stripMp4Metadata(p3))).toBeInstanceOf(Mp4Error);
    });
  });
});

describe("lecteur mp4 : durée de toutes les pistes gardées (tour 5)", () => {
  it("une piste meta/mett, mebx ou tmcd qui annonce 2 s dans mdhd et 120 s dans stts compte pour 120 s", async () => {
    const original = await fixture("story-2s.mp4");
    for (const [handler, format] of [
      ["meta", "mett"],
      ["tmcd", "tmcd"],
      ["meta", "mebx"],
    ] as const) {
      const { file } = withMdatTrack(
        original,
        (at) => sampledTrack(handler, format, at, gpxPayload.length, 120_000, 2000),
        gpxPayload,
      );
      expect((await readMp4Buffer(file)).durationMs, handler).toBeGreaterThanOrEqual(119_900);
      // Même durée des deux côtés : celle du fichier d'origine reste.
      const calm = withMdatTrack(original, (at) => sampledTrack(handler, format, at, gpxPayload.length), gpxPayload);
      expect((await readMp4Buffer(calm.file)).durationMs, handler).toBeLessThan(2200);
    }
  });

  it("une vidéo valide de 40 s avec du son est lue avec sa durée : ni illisible ni refusée par le lecteur", async () => {
    const base = Buffer.from(await fixture("story-2s.mp4"));
    const setDuration = (type: "mvhd" | "mdhd", seconds: number, from: number) => {
      const at = base.indexOf(type, from) + 4;
      const timescale = base.readUInt32BE(at + 4 + 8);
      base.writeUInt32BE(Math.round(timescale * seconds), at + 4 + 12);
      return at;
    };
    setDuration("mvhd", 40, 0);
    // Les deux pistes disent 40 s dans mdhd et dans stts.
    const videoMdhd = setDuration("mdhd", 40, 0);
    const audioMdhd = setDuration("mdhd", 40, videoMdhd + 8);
    const videoStts = base.indexOf("stts");
    const audioStts = base.indexOf("stts", videoStts + 1);
    for (const [stts, mdhd] of [
      [videoStts, videoMdhd],
      [audioStts, audioMdhd],
    ] as const) {
      const timescale = base.readUInt32BE(mdhd + 4 + 8);
      // 2 s d'origine, 40 s annoncées : chaque durée d'échantillon est multipliée par 20.
      expect(timescale).toBeGreaterThan(0);
      for (let i = 0; i < base.readUInt32BE(stts + 8); i++) {
        const delta = stts + 12 + i * 8 + 4;
        base.writeUInt32BE(base.readUInt32BE(delta) * 20, delta);
      }
    }
    const info = await readMp4Buffer(base);
    expect(info.hasAudio).toBe(true);
    expect(info.durationMs).toBeGreaterThan(39_000);
    expect(info.durationMs).toBeLessThan(41_000);
  });
});

// ─── Tour 6 : tout octet de mdat hors des échantillons vidéo et son est effacé ────────────────────────────────────────

/** Le même `trak` PCM avec un autre décalage de morceau (son seul `stco`). */
function withOffset(track: Buffer, offset: number): Buffer {
  const out = Buffer.from(track);
  out.writeUInt32BE(offset, out.lastIndexOf("stco") + 12);
  return out;
}

describe("effacement de mdat hors des échantillons vidéo et son (tour 6)", () => {
  const workDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
    const dir = await mkdtemp(join(tmpdir(), "orasso-strip6-"));
    try {
      return await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const strip = async (dir: string, file: Buffer, name = "a.mp4") => {
    const path = join(dir, name);
    await writeFile(path, file);
    await stripMp4Metadata(path);
    return { path, out: await readFile(path) };
  };
  const mdatOf = (data: Buffer) => {
    const at = data.indexOf("mdat") - 4;
    return { at, body: data.subarray(at + 8, at + data.readUInt32BE(at)) };
  };
  /** Bloc façon Novatek : en-tête « freeGPS », position factice, rien d'autre. */
  const freeGps = Buffer.concat([
    Buffer.from([0, 0, 0x80, 0]),
    Buffer.from("freeGPS "),
    Buffer.from(`A N ${FAKE_PLACE} 042.6887 002.8948 $GPRMC,123519,A,4253.3,N,00253.7,E`.padEnd(120, "\0"), "latin1"),
  ]);

  it("un bloc « freeGPS » glissé entre deux morceaux vidéo est absent du fichier enregistré, l'image et le son sont intacts", async () => {
    const original = await fixture("story-2s.mp4");
    const { file, at } = withMdatGap(original, freeGps);
    expect(file.includes("freeGPS")).toBe(true);
    expect(file.length).toBe(original.length + freeGps.length);
    const before = await readMp4Buffer(file);
    await workDir(async (dir) => {
      const { path, out } = await strip(dir, file);
      expect(out.length).toBe(file.length);
      for (const trace of ["freeGPS", "GPRMC", "42.6887", "2.8948", FAKE_PLACE]) {
        expect(out.includes(trace), trace).toBe(false);
      }
      expect(out.subarray(at, at + freeGps.length).every((b) => b === 0)).toBe(true);
      // Tout le reste de mdat est identique, octet pour octet.
      const a = mdatOf(file);
      const b = mdatOf(out);
      const gapAt = at - a.at - 8;
      expect(b.body.subarray(0, gapAt).equals(a.body.subarray(0, gapAt))).toBe(true);
      expect(b.body.subarray(gapAt + freeGps.length).equals(a.body.subarray(gapAt + freeGps.length))).toBe(true);
      const after = await readMp4File(path);
      expect(after.durationMs).toBe(before.durationMs);
      expect(after.h264).toBe(true);
      expect(after.hasAudio).toBe(true);
    });
  });

  it("les fixtures sans trou sont gardées telles quelles : mdat identique octet pour octet", async () => {
    await workDir(async (dir) => {
      for (const name of ["story-2s.mp4", "story-hevc.mp4", "story-paysage-2s.mp4"]) {
        const original = await fixture(name);
        const { out } = await strip(dir, original, name);
        expect(mdatOf(out).body.equals(mdatOf(original).body), name).toBe(true);
      }
    });
  });

  it("un MOV avec du son PCM stéréo 16 bits et stsz à taille 1 : le son est conservé octet pour octet (versions 0, 1 et 2)", async () => {
    const original = await fixture("story-2s.mp4");
    const frames = 4800;
    const pcm = Buffer.from(randomBytes(frames * 4));
    pcm[0] = 1; // jamais tout à zéro
    for (const version of [0, 1, 2] as const) {
      const payload = Buffer.concat([pcm, freeGps]);
      const { file, at } = withMdatTrack(original, (o) => pcmTrack(version, o, frames), payload);
      await workDir(async (dir) => {
        const { out } = await strip(dir, file);
        expect(out.length).toBe(file.length);
        expect(out.subarray(at, at + pcm.length).equals(pcm), `v${version}`).toBe(true);
        expect(out.includes("freeGPS"), `v${version}`).toBe(false);
        expect(out.subarray(at + pcm.length).every((b) => b === 0)).toBe(true);
        // L'image et le son AAC d'origine aussi.
        const kept = mdatOf(original).body.length;
        expect(mdatOf(out).body.subarray(0, kept).equals(mdatOf(file).body.subarray(0, kept))).toBe(true);
      });
    }
  });

  it("refuse un son à stsz de taille 1 dont la description ne permet pas un calcul sûr (AAC, 12 bits, 0 bit, paquets inégaux, version inconnue)", async () => {
    const original = await fixture("story-2s.mp4");
    const frames = 480;
    const payload = Buffer.alloc(frames * 4, 5);
    const odd = pcmTrack(1, 0, frames);
    odd.writeUInt32BE(7, odd.indexOf("sowt") + 4 + 28); // 480 trames ne sont pas un multiple de 7
    const unknown = pcmTrack(0, 0, frames);
    unknown.writeUInt16BE(9, unknown.indexOf("sowt") + 4 + 8);
    const cases: [string, (o: number) => Buffer][] = [
      ["aac", (o) => pcmTrack(0, o, frames, "mp4a")],
      ["12 bits", (o) => pcmTrack(0, o, frames, "sowt", 12)],
      ["0 bit", (o) => pcmTrack(0, o, frames, "sowt", 0)],
      ["paquets inégaux", (o) => withOffset(odd, o)],
      ["version 9", (o) => withOffset(unknown, o)],
    ];
    await workDir(async (dir) => {
      for (const [name, track] of cases) {
        const { file } = withMdatTrack(original, track, payload);
        const path = join(dir, `${name}.mp4`);
        await writeFile(path, file);
        expect(await kind(stripMp4Metadata(path)), name).toBe("unreadable");
      }
    });
  });

  it("refuse un échantillon vidéo ou son hors de tout mdat, et un dref qui renvoie vers un autre fichier", async () => {
    const original = await fixture("story-2s.mp4");
    await workDir(async (dir) => {
      // Premier morceau vidéo déplacé dans moov (avant mdat).
      const video = Buffer.from(original);
      video.writeUInt32BE(100, video.indexOf("stco") + 12);
      const p1 = join(dir, "video.mp4");
      await writeFile(p1, video);
      expect(await kind(stripMp4Metadata(p1))).toBe("unreadable");
      // Idem pour le son (deuxième stco).
      const audio = Buffer.from(original);
      audio.writeUInt32BE(100, audio.indexOf("stco", audio.indexOf("stco") + 1) + 12);
      const p2 = join(dir, "audio.mp4");
      await writeFile(p2, audio);
      expect(await kind(stripMp4Metadata(p2))).toBe("unreadable");
      // dref : l'entrée « url » n'est plus autonome (indicateur 1 -> 0).
      const external = Buffer.from(original);
      const url = external.indexOf("url ");
      expect(external.readUInt32BE(url + 4) & 1).toBe(1);
      external.writeUInt32BE(0, url + 4);
      const p3 = join(dir, "dref.mp4");
      await writeFile(p3, external);
      expect(await kind(stripMp4Metadata(p3))).toBe("unreadable");
    });
  });
});

describe("extensions des descriptions, plages fusionnées, collision (tour 6, complément Codex)", () => {
  const workDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
    const dir = await mkdtemp(join(tmpdir(), "orasso-strip6b-"));
    try {
      return await run(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const mdatOf = (data: Buffer) => {
    const at = data.indexOf("mdat") - 4;
    return data.subarray(at + 8, at + data.readUInt32BE(at));
  };

  it("une uuid (ou une extension inconnue) sous stsd/avc1 et stsd/mp4a est mise à zéro ; avcC, esds et le reste de la description restent", async () => {
    const original = await fixture("story-2s.mp4");
    const place = Buffer.from(`GPS ${FAKE_PLACE} 42.6887,2.8948`);
    let file = withEntryChild(original, "avc1", box("uuid", Buffer.alloc(16, 9), place));
    file = withEntryChild(file, "mp4a", box("zzzz", place));
    expect(file.includes(FAKE_PLACE)).toBe(true);
    const before = await readMp4Buffer(file);
    const avcC = original.subarray(
      original.indexOf("avcC") - 4,
      original.indexOf("avcC") - 4 + original.readUInt32BE(original.indexOf("avcC") - 4),
    );
    const esds = original.subarray(
      original.indexOf("esds") - 4,
      original.indexOf("esds") - 4 + original.readUInt32BE(original.indexOf("esds") - 4),
    );
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      expect(await stripMp4Metadata(path)).toBeGreaterThanOrEqual(2);
      const out = await readFile(path);
      expect(out.length).toBe(file.length);
      for (const trace of [FAKE_PLACE, "42.6887", "uuid", "zzzz"]) expect(out.includes(trace), trace).toBe(false);
      expect(out.includes(avcC)).toBe(true);
      expect(out.includes(esds)).toBe(true);
      expect(mdatOf(out).equals(mdatOf(file))).toBe(true);
      const after = await readMp4File(path);
      expect([after.durationMs, after.h264, after.hasAudio, after.width]).toEqual([
        before.durationMs,
        true,
        true,
        before.width,
      ]);
    });
  });

  it("les descriptions des fixtures (avc1, mp4a, hvc1) gardent chacune de leurs boîtes : stsd identique avant et après", async () => {
    await workDir(async (dir) => {
      for (const name of ["story-2s.mp4", "story-hevc.mp4", "story-paysage-2s.mp4"]) {
        const original = await fixture(name);
        const path = join(dir, name);
        await writeFile(path, original);
        await stripMp4Metadata(path);
        const out = await readFile(path);
        for (let from = original.indexOf("stsd"); from >= 0; from = original.indexOf("stsd", from + 1)) {
          const size = original.readUInt32BE(from - 4);
          expect(
            out.subarray(from - 4, from - 4 + size).equals(original.subarray(from - 4, from - 4 + size)),
            name,
          ).toBe(true);
        }
      }
    });
  });

  it("mille références au même bloc : une seule plage, travail et temps bornés par le fichier", async () => {
    const original = await fixture("story-2s.mp4");
    const junk = Buffer.alloc(4 * 1024 * 1024, 0x41); // 4 Mo de « n'importe quoi » dans mdat
    const probe = Buffer.alloc(100, 0x42);
    // Une piste vidéo supplémentaire dont 1 000 morceaux visent le même bloc (probe), au milieu du bruit.
    const payload = Buffer.concat([junk, probe, junk]);
    const delta = chunksTrack("vide", "avc1", Array(1000).fill(0), 100).length;
    const aimed = original.length + delta + junk.length;
    const { file } = withMdatTrack(original, () => chunksTrack("vide", "avc1", Array(1000).fill(aimed), 100), payload);
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      const start = Date.now();
      await stripMp4Metadata(path);
      expect(Date.now() - start).toBeLessThan(5000);
      const out = await readFile(path);
      expect(out.subarray(aimed, aimed + 100).equals(probe)).toBe(true);
      expect(out.subarray(aimed - 10, aimed).every((b) => b === 0)).toBe(true);
      expect(out.subarray(aimed + 100, aimed + 110).every((b) => b === 0)).toBe(true);
      expect(out.length).toBe(file.length);
    });
  });

  it("une piste meta/mett qui vise les 128 premiers octets vidéo ne les efface pas", async () => {
    const original = await fixture("story-2s.mp4");
    const firstVideo = original.readUInt32BE(original.indexOf("stco") + 12);
    const delta = sampledTrack("meta", "mett", 0, 128).length;
    const { file } = withMdatTrack(
      original,
      () => sampledTrack("meta", "mett", firstVideo + delta, 128),
      Buffer.alloc(16, 1),
    );
    await workDir(async (dir) => {
      const path = join(dir, "a.mp4");
      await writeFile(path, file);
      await stripMp4Metadata(path);
      const out = await readFile(path);
      const at = firstVideo + delta;
      expect(out.subarray(at, at + 128).equals(file.subarray(at, at + 128))).toBe(true);
      expect(out.subarray(at, at + 128).some((b) => b !== 0)).toBe(true);
      expect(
        mdatOf(out)
          .subarray(0, original.length - 3515)
          .equals(mdatOf(file).subarray(0, original.length - 3515)),
      ).toBe(true);
    });
  });
});
