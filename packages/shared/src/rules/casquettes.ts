// Les lignes de la feuille « Mes casquettes » (lot R9n, maquette R9 `mcSheet`) : logique pure, sans écran. « Moi » d'abord
// (le compte personnel : passionné ou visiteur), puis chaque casquette de page dans l'ordre de `GET /me` ; l'administration
// reste à l'Administration (elle n'est pas une page), le survol en assistance n'est jamais proposé.
import { casquettesLabels as L } from "../labels/casquettes.fr";

export type SheetEntryInput = {
  kind: string;
  id: string;
  label: string;
  logoUrl: string | null;
  assisted?: boolean;
};

export type SheetRow = {
  /** `me` ou `<kind>:<id>` : sert de clé et d'identifiant de test. */
  key: string;
  kind: string;
  id: string | null;
  title: string;
  subtitle: string;
  logoUrl: string | null;
  active: boolean;
};

/** Les casquettes qui sont des pages (celles qui signent et lisent « en tant que »). */
const PAGE_KINDS = new Set(["organizer", "pro", "provider", "media"]);

export const isPageCasquette = (kind: string): boolean => PAGE_KINDS.has(kind);

/**
 * Les lignes de la feuille. `activeKey` : `me` (le compte personnel) ou `<kind>:<id>` de la casquette active.
 * `kindLabel` donne le type affiché sous le nom (« Organisateur », « Pro »…).
 */
export function casquetteRows(
  entries: readonly SheetEntryInput[],
  options: {
    base: "fan" | "visitor";
    pseudo: string;
    avatarUrl: string | null;
    activeKind: string;
    activeId: string | null;
    kindLabel: (kind: string) => string;
  },
): SheetRow[] {
  const meActive = options.activeKind === "fan" || options.activeKind === "visitor";
  const me: SheetRow = {
    key: "me",
    kind: options.base,
    id: null,
    title: `${L.mePrefix} · ${options.pseudo}`,
    subtitle: options.base === "visitor" ? L.meVisitor : L.meFan,
    logoUrl: options.avatarUrl,
    active: meActive,
  };
  const pages = entries
    .filter((e) => isPageCasquette(e.kind) && !e.assisted)
    .map(
      (e): SheetRow => ({
        key: `${e.kind}:${e.id}`,
        kind: e.kind,
        id: e.id,
        title: e.label,
        subtitle: options.kindLabel(e.kind),
        logoUrl: e.logoUrl,
        active: e.kind === options.activeKind && (e.kind === "provider" || e.id === options.activeId),
      }),
    );
  return [me, ...pages];
}

// --- L'auteur d'une story lancée depuis « Publier » (lot R9n, tour 1, point 1) ------------------------------------------

export type StoryAuthorChoice =
  | { kind: "me" }
  | { kind: "page"; persona: "organizer" | "pro" | "provider" | "media"; id: string; name: string; key: string };

/** Les préfixes de clé d'auteur (`X-Orasso-Actor`) → la casquette. */
const PERSONA_OF_PREFIX: Record<string, "organizer" | "pro" | "provider" | "media"> = {
  s: "organizer",
  p: "pro",
  v: "provider",
  m: "media",
};

/**
 * L'auteur d'une story d'après `?auteur=` : `me` (la personne), une clé `s:`, `p:`, `v:`, `m:` **tenue par le compte** (une
 * casquette de `GET /me` → `personas`, comme `publishAuthors`), sinon `null` : l'appelant prend alors la casquette active. Une clé
 * qui n'est pas une casquette du compte n'est jamais crue (l'API revérifie les droits de toute façon). Prestataire et média : un
 * seul par compte, l'identifiant de la clé doit être celui de la ligne.
 */
export function resolveStoryAuthor(
  auteur: string | null | undefined,
  entries: readonly Pick<SheetEntryInput, "kind" | "id" | "label" | "assisted">[],
): StoryAuthorChoice | null {
  const raw = auteur?.trim();
  if (!raw) return null;
  if (raw === "me") return { kind: "me" };
  const at = raw.indexOf(":");
  const persona = at < 1 ? undefined : PERSONA_OF_PREFIX[raw.slice(0, at)];
  if (!persona) return null;
  const id = raw.slice(at + 1);
  const entry = entries.find((e) => !e.assisted && e.kind === persona && e.id === id);
  return entry ? { kind: "page", persona, id, name: entry.label, key: raw } : null;
}

/**
 * L'auteur d'une story est-il encore une casquette du compte ? (R9n, tour 2, point 9 : l'auteur est figé à l'ouverture ; si un
 * rafraîchissement de `GET /me` le retire, l'envoi est bloqué.) La personne : toujours ; une structure ou une fiche pro : sa ligne
 * (même identifiant) ; prestataire et média : leur ligne.
 */
export function storyAuthorAllowed(
  author: { persona: string; structureId?: string; proId?: string },
  entries: readonly Pick<SheetEntryInput, "kind" | "id" | "assisted">[],
): boolean {
  if (author.persona === "fan") return true;
  return entries.some(
    (e) =>
      !e.assisted &&
      e.kind === author.persona &&
      (author.persona === "organizer"
        ? e.id === author.structureId
        : author.persona === "pro"
          ? e.id === author.proId
          : true),
  );
}
