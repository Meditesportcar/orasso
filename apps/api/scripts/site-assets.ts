// Images statiques du site (lot 56), écrites dans `apps/web/public` :
//  - `styles/<style>.png` : les huit styles d'affiche sur l'événement de démonstration du seed (mur de /organisateurs,
//    bandes de l'accueil). `POST /posters/preview` exige un compte : la page publique ne peut pas l'appeler, elle sert
//    donc ces rendus faits une fois avec le même moteur.
//  - `mail/affiche-nuit.jpg` : l'en-tête « affiche de nuit » des e-mails (logotype compris).
// À relancer si les gabarits d'affiche ou le logotype changent : `pnpm --filter @orasso/api site:assets`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { posterStyles } from "@orasso/shared";
import sharp from "sharp";

import { render } from "../src/modules/events/poster/render";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const publicDir = join(root, "apps", "web", "public");

/** Photo de substitution : un crépuscule sur un parking (dégradé), sans personne ni plaque. */
async function dusk(width: number, height: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2233"/><stop offset="0.55" stop-color="#7a4a3a"/><stop offset="0.62" stop-color="#e08a3c"/>
        <stop offset="0.63" stop-color="#2b2724"/><stop offset="1" stop-color="#0f0f12"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>
    <g fill="#0b0b0d"><rect x="${width * 0.12}" y="${height * 0.66}" width="${width * 0.34}" height="${height * 0.06}" rx="18"/>
    <rect x="${width * 0.5}" y="${height * 0.68}" width="${width * 0.3}" height="${height * 0.05}" rx="16"/></g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function posters() {
  const photo = await dusk(1080, 1350);
  const out = join(publicDir, "styles");
  await mkdir(out, { recursive: true });
  for (const style of posterStyles) {
    const png = await render(
      {
        style,
        title: "Nocturne de Canet",
        startsAt: new Date("2026-10-24T19:00:00+02:00"),
        timezone: "Europe/Paris",
        place: "Canet-en-Roussillon",
        structureName: "MéditeSportCar",
        photo,
        logo: null,
      },
      "post",
      540,
    );
    await writeFile(join(out, `${style}.png`), png);
    console.log(`styles/${style}.png ${(png.length / 1024).toFixed(0)} Ko`);
  }
}

/** L'affiche de nuit : fond Béton profond, lampe moutarde, marquage au sol, logotype. 1200 × 360 (affiché à 600 px). */
async function mailBanner() {
  const W = 1200;
  const H = 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="lamp" cx="0.82" cy="0.05" r="0.75">
        <stop offset="0" stop-color="#e9b824" stop-opacity="0.55"/><stop offset="0.45" stop-color="#e9b824" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#e9b824" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17191e"/><stop offset="1" stop-color="#050608"/></linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" fill="url(#lamp)"/>
    <g stroke="#f3ebdd" stroke-opacity="0.16" stroke-width="10" stroke-dasharray="70 56" transform="rotate(-8 600 180)">
      <line x1="-100" y1="290" x2="1300" y2="290"/>
    </g>
  </svg>`;
  const logo = await sharp(
    await readFile(join(root, "identite", "logo", "orasso-logo-principal-fond-sombre-800px.png")),
  )
    .resize({ width: 520 })
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const jpg = await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: 72, top: Math.round((H - (logoMeta.height ?? 84)) / 2) }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const dir = join(publicDir, "mail");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "affiche-nuit.jpg"), jpg);
  console.log(`mail/affiche-nuit.jpg ${(jpg.length / 1024).toFixed(0)} Ko`);
}

await posters();
await mailBanner();
