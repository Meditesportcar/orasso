// Les onglets internes du Profil (lot R7b1, maquette R7.12) : Garage · Sorties. Lot R8b1 (D40, maquette R8.1) : les segments
// pleins deviennent les onglets soulignés du kit (`UnderTabs`) : « Garage · N » (N = véhicules actifs ; icône voiture) et
// « Sorties » (icône tampon), puis « Publications ». Ce composant n'est qu'une enveloppe mince : il garde les identifiants `profil-tabs` et
// `profil-tab-<id>` ; lot R8b2 : le troisième onglet, « Publications » (icône galerie), ouvert par défaut. La rangée est collante :
// c'est l'écran hôte qui la colle (`TabScreen`, option `stickyIndex`), sur le fond de l'écran.
import type { IconName } from "@orasso/design-system/native";
import { profileTabsLabels as L, type ProfileTab } from "@orasso/shared";

import { UnderTabs } from "@/ui/UnderTabs";

const ITEMS: { id: ProfileTab; label: string; icon: IconName }[] = [
  { id: "garage", label: L.garage, icon: "vehicle" },
  { id: "sorties", label: L.outings, icon: "stamp" },
  { id: "publications", label: L.publications, icon: "gallery" },
];

export function ProfileTabs({
  value,
  onChange,
  /** Les onglets proposés (un profil sans véhicule n'a pas « Garage » ; un compte privé vu d'un inconnu n'en a pas). */
  items = ITEMS.map((i) => i.id),
  /** Le nombre de véhicules actifs, dans l'onglet « Garage · N » ; inconnu : « Garage » seul. */
  garageCount = null,
}: {
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  items?: readonly ProfileTab[];
  garageCount?: number | null;
}) {
  return (
    <UnderTabs
      value={value}
      onChange={onChange}
      items={ITEMS.filter((i) => items.includes(i.id)).map((i) => ({
        id: i.id,
        label: i.label,
        icon: i.icon,
        count: i.id === "garage" ? garageCount : null,
      }))}
      accessibilityLabel={L.group}
      testID="profil-tabs"
      itemTestID={(id) => `profil-tab-${id}`}
    />
  );
}
