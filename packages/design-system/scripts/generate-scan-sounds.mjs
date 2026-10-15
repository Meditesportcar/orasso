// Sons PROVISOIRES du résultat de scan, synthétisés ici (aucune source externe, aucun droit à gérer) :
//   ok         : deux notes montantes brèves (un son bref)
//   duplicate  : deux bips identiques (README ScanResult : « deux bips »)
//   refused    : un son grave et rugueux (« un son grave »)
// Trois sons nettement distincts, audibles sans regarder. À remplacer par un vrai design sonore plus tard :
// il suffit de remplacer les trois fichiers de src/native/sounds/ (mêmes noms).
// Usage : node scripts/generate-scan-sounds.mjs (sorties versionnées).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "src/native/sounds");
mkdirSync(out, { recursive: true });

const RATE = 22050;

/** Une note : onde (sinus, carré adouci ou dent de scie), enveloppe d'attaque courte et de chute exponentielle. */
function tone({ freq, ms, shape = "sine", gain = 0.6, glide = 0 }) {
  const n = Math.round((RATE * ms) / 1000);
  const samples = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = freq + glide * t;
    phase += (2 * Math.PI * f) / RATE;
    let v = Math.sin(phase);
    if (shape === "saw") v = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
    if (shape === "square") v = Math.tanh(4 * Math.sin(phase));
    const attack = Math.min(1, i / (RATE * 0.004));
    const decay = Math.exp(-3.2 * t);
    samples[i] = v * attack * decay * gain;
  }
  return samples;
}

const silence = (ms) => new Float32Array(Math.round((RATE * ms) / 1000));

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Float32Array(total);
  let pos = 0;
  for (const part of parts) {
    all.set(part, pos);
    pos += part.length;
  }
  return all;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sounds = {
  ok: concat(tone({ freq: 784, ms: 90 }), tone({ freq: 1175, ms: 190 })),
  duplicate: concat(tone({ freq: 660, ms: 90, shape: "square", gain: 0.4 }), silence(70), tone({ freq: 660, ms: 90, shape: "square", gain: 0.4 })),
  refused: tone({ freq: 150, ms: 420, shape: "saw", gain: 0.7, glide: -40 }),
};

for (const [name, samples] of Object.entries(sounds)) {
  const file = resolve(out, `${name}.wav`);
  writeFileSync(file, wav(samples));
  console.log(`${name}.wav : ${Math.round((samples.length / RATE) * 1000)} ms`);
}
