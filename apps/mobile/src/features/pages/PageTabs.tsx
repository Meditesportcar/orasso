// Les onglets soulignés de la page d'une structure et de la fiche d'un pro (lot R8g, maquette R9.3) : « Événements » ou
// « Présentation », « Publications », « Mentions · N ». Enveloppe mince sur `UnderTabs` du kit ; la rangée est collée par
// l'écran hôte (`StickyHeader`). Identifiants : `page-tabs`, `page-tab-<id>`.
import type { IconName } from "@orasso/design-system/native";
import { pagesLabels as L, type PageTab, type PageTabItem } from "@orasso/shared";

import { UnderTabs } from "@/ui/UnderTabs";

const ICON: Record<PageTab, IconName> = {
  events: "calendar",
  presentation: "briefcase",
  publications: "gallery",
  offers: "ticket",
  mentions: "bubble",
};

export function PageTabs({
  value,
  onChange,
  items,
}: {
  value: PageTab;
  onChange: (tab: PageTab) => void;
  items: readonly PageTabItem[];
}) {
  return (
    <UnderTabs
      value={value}
      onChange={onChange}
      items={items.map((i) => ({ id: i.id, label: i.label, icon: ICON[i.id], count: i.count }))}
      accessibilityLabel={L.group}
      testID="page-tabs"
      itemTestID={(id) => `page-tab-${id}`}
    />
  );
}
