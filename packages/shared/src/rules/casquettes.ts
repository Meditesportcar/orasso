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
