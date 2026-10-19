// Liste des départements en vraies cases de formulaire (lot 41) : l'inscription marche sans JavaScript (un <details>
// s'ouvre sans script, les cases cochées partent avec le formulaire). Avec JavaScript, la liste suit la carte et garde
// l'ordre du choix dans un champ caché (`departmentOrder`) : le premier est le favori. Chemin clavier de la carte.

import { departmentChoices, departmentLabel } from "./choices";

export type DepartmentChecklistProps = {
  selected: readonly string[];
  onToggle: (code: string) => void;
  /** Nom des cases du formulaire (un département par case cochée). */
  name?: string;
  summary?: string;
  className?: string;
};

export function DepartmentChecklist({
  selected,
  onToggle,
  name = "department",
  summary = "Choisir dans une liste",
  className,
}: DepartmentChecklistProps) {
  const chosen = new Set(selected);
  return (
    <details className={["o-deptlist", className].filter(Boolean).join(" ")} data-testid="department-details">
      <summary className="o-deptlist__summary o-t-label">{summary}</summary>
      <input type="hidden" name={`${name}Order`} value={selected.join(",")} />
      <ul className="o-deptlist__items" data-testid="department-list">
        {departmentChoices.map((d) => (
          <li key={d.code}>
            <label className="o-deptlist__item o-t-body">
              <input
                type="checkbox"
                name={name}
                value={d.code}
                checked={chosen.has(d.code)}
                onChange={() => onToggle(d.code)}
              />
              <span>{departmentLabel(d)}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}
