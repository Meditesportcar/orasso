// Fusion des jetons : docs/design-system/tokens.json (v3.3, gelé, jamais modifié ici) + la surcouche DA v2
// packages/design-system/tokens.v2.json (lot 38, ARCHITECTURE-DA-V2 § 1.1).
// - Une valeur de la surcouche remplace celle de la base, thème par thème, dans le groupe du même nom (color,
//   shadow, ground-fx, bar-fx). Un nom absent de la base (dérivé du générateur, ex. surface-field) est ajouté.
// - `added.color` ajoute des jetons ; `added.stamp-ink` devient `stamp-ink-<département>` + `stamp-ink-default`
//   (= le jeton nommé, `win`) ; `added.type` ajoute un style de texte copié d'un style de base.
// - `type.tokens` (lot C1) remplace des propriétés d'un style de texte de la base (valeurs de l'artefact DA v2).
// Utilisé par generate-tokens.mjs et par src/tokens.test.ts : les deux voient exactement les mêmes valeurs.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BASE_PATH = resolve(root, "../../docs/design-system/tokens.json");
export const OVERLAY_PATH = resolve(root, "tokens.v2.json");

const THEMED_GROUPS = ["color", "shadow", "ground-fx", "bar-fx"];

/** Applique la surcouche à une copie de la base. Pur : ne lit rien. */
export function mergeTokens(base, overlay) {
  const json = structuredClone(base);
  const themes = json.color.themes.map((t) => t.id);
  /** Liste plate des écarts, pour la page de recette (/ds, /_ds). */
  const changes = [];

  for (const group of THEMED_GROUPS) {
    for (const entry of overlay[group]?.tokens ?? []) {
      const list = json[group].tokens;
      let token = list.find((tk) => tk.name === entry.name);
      if (!token) {
        token = { name: entry.name, value: {}, derived: true };
        list.push(token);
      }
      const before = { ...token.value };
      for (const theme of Object.keys(entry.value)) {
        if (!themes.includes(theme)) throw new Error(`surcouche : thème inconnu ${theme} (${group}/${entry.name})`);
        token.value[theme] = entry.value[theme];
      }
      for (const theme of themes) {
        if (token.value[theme] === undefined) {
          throw new Error(`surcouche : ${group}/${entry.name} sans valeur pour ${theme}`);
        }
      }
      changes.push({ kind: "changed", group, name: entry.name, before, value: { ...token.value }, why: entry.why });
    }
  }

  // Lot C1 (D33) : un style de texte de la base prend les valeurs de l'artefact (taille, graisse, largeur…).
  for (const entry of overlay.type?.tokens ?? []) {
    const style = json.type.groups.flatMap((g) => g.styles).find((s) => s.name === entry.name);
    if (!style) throw new Error(`surcouche : style de texte inconnu ${entry.name}`);
    const before = { ...style };
    const { name: _name, why, ...props } = entry;
    for (const [key, value] of Object.entries(props)) {
      if (!["fontSize", "lineHeight", "fontWeight", "letterSpacing", "fontStretch"].includes(key)) {
        throw new Error(`surcouche : propriété de texte inconnue ${key} (${entry.name})`);
      }
      style[key] = value;
    }
    changes.push({ kind: "changed", group: "type", name: entry.name, before, value: props, why });
  }

  const added = overlay.added ?? {};
  for (const entry of added.color ?? []) {
    if (json.color.tokens.some((tk) => tk.name === entry.name)) {
      throw new Error(`surcouche : ${entry.name} existe déjà dans la base`);
    }
    json.color.tokens.push({ name: entry.name, value: { ...entry.value }, usage: entry.usage });
    changes.push({ kind: "added", group: "color", name: entry.name, value: { ...entry.value }, why: entry.usage });
  }
  for (const entry of added["stamp-ink"] ?? []) {
    const name = `stamp-ink-${entry.department}`;
    const value =
      typeof entry.value === "string" ? Object.fromEntries(themes.map((t) => [t, entry.value])) : { ...entry.value };
    json.color.tokens.push({ name, value, usage: `encre de tampon du département ${entry.department}` });
    changes.push({ kind: "added", group: "color", name, value, why: `encre de tampon (${entry.department})` });
  }
  if (added["stamp-ink-default"]) {
    const ref = json.color.tokens.find((tk) => tk.name === added["stamp-ink-default"]);
    if (!ref) throw new Error(`surcouche : stamp-ink-default désigne un jeton inconnu (${added["stamp-ink-default"]})`);
    const value = { ...ref.value };
    json.color.tokens.push({
      name: "stamp-ink-default",
      value,
      usage: `encre des autres départements (= ${ref.name})`,
    });
    changes.push({ kind: "added", group: "color", name: "stamp-ink-default", value, why: `= ${ref.name}` });
  }
  for (const entry of added.type ?? []) {
    const group = json.type.groups.find((g) => g.name === entry.group);
    if (!group) throw new Error(`surcouche : groupe de texte inconnu ${entry.group}`);
    const source = json.type.groups.flatMap((g) => g.styles).find((s) => s.name === entry.basedOn);
    if (!source) throw new Error(`surcouche : style de base inconnu ${entry.basedOn}`);
    const style = { ...source, name: entry.name, fontStretch: entry.fontStretch };
    if (entry.sample) style.sample = entry.sample;
    if (entry.usage) style.usage = entry.usage;
    group.styles.push(style);
    changes.push({
      kind: "added",
      group: "type",
      name: entry.name,
      value: { fontStretch: entry.fontStretch, basedOn: entry.basedOn },
      why: entry.usage,
    });
  }

  json.overlay = { version: overlay.version, date: overlay.date, basedOn: overlay.basedOn };
  return { json, changes };
}

/** Base + surcouche, lues sur le disque. */
export function loadMergedTokens() {
  const base = JSON.parse(readFileSync(BASE_PATH, "utf8"));
  const overlay = JSON.parse(readFileSync(OVERLAY_PATH, "utf8"));
  return { base, overlay, ...mergeTokens(base, overlay) };
}
