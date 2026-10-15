// Prépare les aperçus d'origine (docs/design-system/components/<Nom>/preview.html) pour la comparaison visuelle :
// chaque aperçu est copié dans apps/web/public/_ds-previews/ en deux versions (Béton, Sable), avec les variables
// des jetons générés (tokens.css) que l'hôte du canevas d'origine fournissait, et les logos à leur place.
// Sortie ignorée par Git. Usage : node scripts/build-preview-harness.mjs

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const components = resolve(root, "docs/design-system/components");
const out = resolve(root, "apps/web/public/_ds-previews");

mkdirSync(resolve(out, "assets"), { recursive: true });
cpSync(resolve(root, "docs/design-system/assets/Logo"), resolve(out, "assets"), { recursive: true });
cpSync(resolve(root, "packages/design-system/src/web/tokens.css"), resolve(out, "tokens.css"));

const names = [];
for (const name of readdirSync(components)) {
  const file = resolve(components, name, "preview.html");
  if (!existsSync(file)) continue;
  names.push(name);
  const source = readFileSync(file, "utf8");
  for (const theme of ["beton", "sable"]) {
    const html = source
      .replace('<html lang="fr">', `<html lang="fr" data-theme="${theme}">`)
      .replace("<head>", '<head><link rel="stylesheet" href="/_ds-previews/tokens.css">')
      .replaceAll("../../assets/Logo/", "/_ds-previews/assets/");
    writeFileSync(resolve(out, `${name}.${theme}.html`), html);
  }
}
console.log(`Aperçus préparés dans apps/web/public/_ds-previews : ${names.join(", ")}`);
