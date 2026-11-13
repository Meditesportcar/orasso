// La bascule des deux vues d'une liste de publications (maquette R8.6 `.r8vt`) : deux boutons icône dans un cadre arrondi, la vue
// active en encre pleine. Noms accessibles « Affichage » (le groupe), « Grille de deux » et « Une par une ».
import { Icon } from "@orasso/design-system/web";
import { publicationsLabels as L, type PublicationsViewMode } from "@orasso/shared";

export function ViewToggle({
  value,
  onChange,
}: {
  value: PublicationsViewMode;
  onChange: (mode: PublicationsViewMode) => void;
}) {
  const item = (mode: PublicationsViewMode, icon: "grid" | "list", label: string) => (
    <button
      type="button"
      className="pub-toggle__btn"
      aria-label={label}
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      data-testid={`publications-view-${mode}`}
    >
      <Icon name={icon} size={18} />
    </button>
  );
  return (
    <div className="pub-toggle" role="toolbar" aria-label={L.viewGroup} data-testid="publications-view-toggle">
      {item("grid", "grid", L.viewGrid)}
      {item("one", "list", L.viewOne)}
    </div>
  );
}
