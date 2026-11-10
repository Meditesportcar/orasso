import { profileTabsLabels as L, type ProfileTab } from "@orasso/shared";

import { UnderTabs } from "../UnderTabs";

// Les onglets internes du Profil (lot R7b1, maquette R7.12) : Garage · Sorties, des liens (`?onglet=`) : l'onglet se lit dans
// l'adresse, la page marche sans JavaScript et se partage. Lot R8b1 (D40, maquette R8.1) : les segments pleins deviennent les
// onglets soulignés du kit (`UnderTabs`) : « Garage · N » (icône voiture) et « Sorties » (icône tampon), collants sous la
// barre du haut (la rangée est un enfant direct de la colonne de la page : un sticky ne colle que dans son parent). Enveloppe mince : elle garde les identifiants `profil-tabs` et `profil-tab-<id>` et accepte un troisième
// onglet (« Publications », lot R8b2) sans rien refaire.

const ITEMS: { id: ProfileTab; label: string; icon: "vehicle" | "stamp" }[] = [
  { id: "garage", label: L.garage, icon: "vehicle" },
  { id: "sorties", label: L.outings, icon: "stamp" },
];

export function ProfileTabs({
  value,
  /** L'adresse de l'onglet : le chemin de la page et ce qu'il faut garder de sa recherche (ex. `retour`). */
  hrefOf,
  /** Les onglets proposés (un profil sans véhicule n'a pas « Garage »). */
  items = ITEMS.map((i) => i.id),
  /** Le nombre de véhicules actifs, dans « Garage · N » ; inconnu : « Garage » seul. */
  garageCount = null,
}: {
  value: ProfileTab;
  hrefOf: (tab: ProfileTab) => string;
  items?: readonly ProfileTab[];
  garageCount?: number | null;
}) {
  return (
    <UnderTabs
      value={value}
      label={L.group}
      testId="profil-tabs"
      itemTestId={(id) => `profil-tab-${id}`}
      sticky
      items={ITEMS.filter((i) => items.includes(i.id)).map((i) => ({
        id: i.id,
        label: i.label,
        icon: i.icon,
        count: i.id === "garage" ? garageCount : null,
        href: hrefOf(i.id),
      }))}
    />
  );
}
