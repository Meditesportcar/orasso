// Liste des départements (web). Deux états du même composant :
// - sans JavaScript (et au rendu serveur) : un <details> de vraies cases de formulaire (`name`), l'inscription marche
//   telle quelle, l'ordre est celui de la liste ;
// - avec JavaScript (lot M6, maquette 8.2, comme la feuille de l'appli) : un bouton qui ouvre une fenêtre « Tes
//   départements » — ✕ (annuler sans rien changer), recherche par nom ou numéro, compteur, les choisis en tête (le
//   premier est le favori), puis tous les autres, un seul bouton principal « Valider (n) ». Rien n'est appliqué avant
//   « Valider ». Le choix part avec le formulaire par des champs cachés (`name` par département, `nameOrder` pour l'ordre).
import { arriveeLabels, MAX_DEPARTMENTS } from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../web/components/Button";
import { Icon } from "../web/components/Icon";
import { type DepartmentChoice, departmentChoices, departmentLabel } from "./choices";

export type DepartmentChecklistProps = {
  selected: readonly string[];
  /** « Valider » : la nouvelle liste ordonnée (le premier est le favori). */
  onValidate: (next: string[]) => void;
  /** Nom des champs du formulaire (un département par champ). */
  name?: string;
  summary?: string;
  /** « favori » (exposant) ou « principal » (pro, média…). */
  favoriteTag?: string;
  className?: string;
};

/** Recherche sans accents ni casse : « pyrenees », « 66 », « 2a ». */
export const foldSearch = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Row = { kind: "sep"; label: string } | { kind: "dept"; choice: DepartmentChoice };

/** Les lignes de la fenêtre : sans recherche, les choisis à l'ouverture en tête puis tous les autres ; sinon le filtre. */
export function departmentRows(opening: readonly string[], query: string): Row[] {
  const q = foldSearch(query);
  if (q) {
    return departmentChoices
      .filter((d) => d.code.toLowerCase().startsWith(q) || foldSearch(d.name).includes(q))
      .map((choice) => ({ kind: "dept" as const, choice }));
  }
  const head = opening
    .map((code) => departmentChoices.find((d) => d.code === code))
    .filter((d): d is DepartmentChoice => Boolean(d));
  const rest = departmentChoices.filter((d) => !opening.includes(d.code));
  return [
    ...(head.length ? [{ kind: "sep" as const, label: arriveeLabels.list.chosenSection }] : []),
    ...head.map((choice) => ({ kind: "dept" as const, choice })),
    { kind: "sep" as const, label: arriveeLabels.list.allSection },
    ...rest.map((choice) => ({ kind: "dept" as const, choice })),
  ];
}

export function DepartmentChecklist({
  selected,
  onValidate,
  name = "department",
  summary = arriveeLabels.list.open,
  favoriteTag = "favori",
  className,
}: DepartmentChecklistProps) {
  // Faux au rendu serveur et à la première hydration : la page sans JavaScript garde le <details>.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [opening, setOpening] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(false);
  const rows = useMemo(() => departmentRows(opening, query), [opening, query]);

  if (!ready) {
    const chosen = new Set(selected);
    return (
      <details className={["o-deptlist", className].filter(Boolean).join(" ")} data-testid="department-details">
        <summary className="o-deptlist__summary o-t-label">{summary}</summary>
        <ul className="o-deptlist__items" data-testid="department-list">
          {departmentChoices.map((d) => (
            <li key={d.code}>
              <label className="o-deptlist__item o-t-body">
                <input type="checkbox" name={name} value={d.code} defaultChecked={chosen.has(d.code)} />
                <span>{departmentLabel(d)}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  const open = () => {
    setDraft([...selected]);
    setOpening([...selected]);
    setQuery("");
    setLimit(false);
    dialog.current?.showModal();
  };
  const toggle = (code: string) => {
    if (!draft.includes(code) && draft.length >= MAX_DEPARTMENTS) return setLimit(true);
    setLimit(false);
    setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));
  };
  const n = draft.length;

  return (
    <div className={className} data-testid="department-details">
      {selected.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}
      <input type="hidden" name={`${name}Order`} value={selected.join(",")} />
      <Button
        type="button"
        variant="secondary"
        icon="list"
        aria-haspopup="dialog"
        onClick={open}
        data-testid="department-list-toggle"
      >
        {summary}
      </Button>
      <dialog
        ref={dialog}
        className="o-deptdlg"
        aria-label={arriveeLabels.list.title}
        data-testid="department-sheet"
        // Échap ou ✕ : on ferme sans rien appliquer.
      >
        <div className="o-deptdlg__head">
          <h2 className="o-t-poster-m">{arriveeLabels.list.title}</h2>
          <Button
            type="button"
            variant="close"
            label={arriveeLabels.list.cancel}
            icon="close"
            onClick={() => dialog.current?.close()}
            data-testid="department-sheet-cancel"
          />
        </div>
        <div className="o-deptdlg__search">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={query}
            placeholder={arriveeLabels.list.search}
            aria-label={arriveeLabels.list.searchAria}
            autoComplete="off"
            autoCorrect="off"
            data-testid="department-search"
            onChange={(e) => setQuery(e.currentTarget.value)}
            // Entrée ne doit pas envoyer le formulaire de la page.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
        <div className="o-deptdlg__count">
          <span className="o-t-label" data-testid="department-count">
            {arriveeLabels.list.count(n)}
          </span>
          <span className="o-t-caption">{arriveeLabels.list.firstIsFavorite(favoriteTag)}</span>
        </div>
        {limit ? (
          <p className="o-deptdlg__error o-t-caption" role="alert" data-testid="department-limit">
            {arriveeLabels.errors.tooMany}
          </p>
        ) : null}
        <ul className="o-deptdlg__list" data-testid="department-list">
          {rows.map((r) => {
            if (r.kind === "sep")
              return (
                <li key={`sep-${r.label}`} className="o-deptdlg__sep o-t-label">
                  {r.label}
                </li>
              );
            const { code, name: label } = r.choice;
            const fav = draft[0] === code;
            return (
              <li key={code}>
                <label className="o-deptdlg__row">
                  <input
                    type="checkbox"
                    checked={draft.includes(code)}
                    aria-label={`${departmentLabel(r.choice)}${fav ? ` · ${favoriteTag}` : ""}`}
                    data-testid={`deptrow-${code}`}
                    onChange={() => toggle(code)}
                  />
                  <span className="o-deptdlg__num o-t-number-narrow" aria-hidden="true">
                    {code}
                  </span>
                  <span className="o-deptdlg__name o-t-body-strong" aria-hidden="true">
                    {label}
                    {fav ? (
                      <span className="o-deptdlg__fav o-t-label">
                        <Icon name="star" size={12} />
                        {favoriteTag}
                      </span>
                    ) : null}
                  </span>
                  <span className="o-deptdlg__box" aria-hidden="true">
                    <Icon name="check" size={16} strokeWidth={2.6} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          icon="check"
          fullWidth
          onClick={() => {
            onValidate(draft);
            dialog.current?.close();
          }}
          data-testid="department-validate"
        >
          {arriveeLabels.list.validate(n)}
        </Button>
      </dialog>
    </div>
  );
}
