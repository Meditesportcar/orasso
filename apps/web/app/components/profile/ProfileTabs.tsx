import { Icon } from "@orasso/design-system/web";
import { profileTabsLabels as L, type ProfileTab } from "@orasso/shared";

import "../../styles/profile.css";

// Les deux onglets internes du Profil (lot R7b1, maquette R7.12 `.seg.r6seg`) : Garage · Sorties. Des liens (`?onglet=`) :
// l'onglet se lit dans l'adresse, la page marche sans JavaScript et se partage. Garage par défaut, partout.

const ITEMS: { id: ProfileTab; label: string; icon: "vehicle" | "stamp" }[] = [
  { id: "garage", label: L.garage, icon: "vehicle" },
  { id: "sorties", label: L.outings, icon: "stamp" },
];

export function ProfileTabs({
  value,
  /** L'adresse de l'onglet : le chemin de la page et ce qu'il faut garder de sa recherche (ex. `retour`). */
  hrefOf,
}: {
  value: ProfileTab;
  hrefOf: (tab: ProfileTab) => string;
}) {
  return (
    <div className="pt-tabs" role="tablist" aria-label={L.group} data-testid="profil-tabs">
      {ITEMS.map((item) => (
        <a
          key={item.id}
          className="pt-tab"
          role="tab"
          aria-selected={value === item.id}
          href={hrefOf(item.id)}
          data-testid={`profil-tab-${item.id}`}
        >
          <Icon name={item.icon} size={16} />
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
}
