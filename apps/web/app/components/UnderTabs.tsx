// Onglets soulignés du kit, version site (lot R8x, parité avec `apps/mobile/src/ui/UnderTabs.tsx`) : des liens (un `href`
// par onglet, rendus côté serveur : ils marchent sans JavaScript). Le nombre facultatif se colle au libellé
// (« Événements · 7 »). `spread` répartit les onglets sur la largeur ; `sticky` colle la rangée sous la barre du haut.
import type { IconName } from "@orasso/design-system/web";
import { Icon } from "@orasso/design-system/web";
import { useEffect, useRef } from "react";

import "../styles/under-tabs.css";

export type UnderTab<T extends string> = { id: T; label: string; icon?: IconName; count?: number | null };

/** Le libellé affiché : « Événements · 7 » quand le nombre est connu (jamais « · 0 » pour un nombre inconnu). */
export function underTabLabel(label: string, count?: number | null): string {
  return typeof count === "number" && Number.isFinite(count) ? `${label} · ${count}` : label;
}

export function UnderTabs<T extends string>({
  value,
  items,
  label,
  testId,
  itemTestId,
  itemClass,
  spread = false,
  sticky = false,
}: {
  value: T;
  items: readonly (UnderTab<T> & { href: string })[];
  label: string;
  testId: string;
  itemTestId?: (id: T) => string;
  /** Une classe de plus pour un onglet (ex. le masquer à une largeur) ; absente : rien ne change. */
  itemClass?: (id: T) => string | undefined;
  spread?: boolean;
  sticky?: boolean;
}) {
  // Une rangée qui déborde (4 onglets à grande police) : l'onglet choisi est ramené dans la vue, rien ne se coupe.
  const row = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'onglet choisi change la position
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('[data-on="true"]');
    if (!el || !on || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
  }, [value]);
  const cls = ["utabs", spread ? "utabs--spread" : "", sticky ? "utabs--sticky" : ""].filter(Boolean).join(" ");
  return (
    <div ref={row} className={cls} role="tablist" aria-label={label} data-testid={testId}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <a
            key={it.id}
            href={it.href}
            role="tab"
            aria-selected={on}
            aria-current={on ? "page" : undefined}
            className={["utabs__tab", itemClass?.(it.id)].filter(Boolean).join(" ")}
            data-on={on ? "true" : undefined}
            data-testid={itemTestId ? itemTestId(it.id) : `${testId}-${it.id}`}
          >
            {it.icon ? <Icon name={it.icon} size={16} /> : null}
            <span>{underTabLabel(it.label, it.count)}</span>
          </a>
        );
      })}
    </div>
  );
}
